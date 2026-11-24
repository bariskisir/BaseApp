use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, Weak};

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn wait_unpoisoned<'a, T>(condvar: &Condvar, guard: MutexGuard<'a, T>) -> MutexGuard<'a, T> {
    match condvar.wait(guard) {
        Ok(next_guard) => next_guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn normalize_key(raw: &str) -> String {
    let trimmed = raw.trim();
    let replaced = trimmed.replace('\\', "/");
    let has_leading_slash = replaced.starts_with('/');
    let mut segments: Vec<&str> = Vec::new();
    for segment in replaced.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments
                    .last()
                    .is_some_and(|prev| *prev != ".." && !prev.ends_with(':'))
                {
                    segments.pop();
                } else if !has_leading_slash {
                    segments.push("..");
                }
            }
            other => segments.push(other),
        }
    }
    let mut normalized = if has_leading_slash {
        format!("/{}", segments.join("/"))
    } else {
        segments.join("/")
    };
    if cfg!(windows) {
        normalized = normalized.to_ascii_lowercase();
    }
    normalized
}

#[derive(Debug, Default)]
struct KeyQueueState {
    next_ticket: u64,
    serving_ticket: u64,
}

#[derive(Debug, Default)]
struct KeyGate {
    state: Mutex<KeyQueueState>,
    condvar: Condvar,
}

struct TicketReleaseGuard {
    gate: Arc<KeyGate>,
}

impl Drop for TicketReleaseGuard {
    fn drop(&mut self) {
        let mut state = lock_unpoisoned(&self.gate.state);
        state.serving_ticket = state.serving_ticket.wrapping_add(1);
        self.gate.condvar.notify_all();
    }
}

struct KeyCleanupGuard {
    gates: Arc<Mutex<HashMap<String, Weak<KeyGate>>>>,
    key: String,
}

impl Drop for KeyCleanupGuard {
    fn drop(&mut self) {
        let mut map = lock_unpoisoned(&self.gates);
        if let Some(weak) = map.get(&self.key)
            && weak.strong_count() == 0
        {
            map.remove(&self.key);
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct FileOperationQueue {
    gates: Arc<Mutex<HashMap<String, Weak<KeyGate>>>>,
}

impl FileOperationQueue {
    pub fn new() -> Self {
        Self::default()
    }

    fn acquire_gate(&self, normalized_key: &str) -> Arc<KeyGate> {
        let mut map = lock_unpoisoned(&self.gates);
        if let Some(existing) = map.get(normalized_key).and_then(Weak::upgrade) {
            return existing;
        }
        let gate = Arc::new(KeyGate::default());
        map.insert(normalized_key.to_string(), Arc::downgrade(&gate));
        gate
    }

    pub fn enqueue<T, F>(&self, key: impl AsRef<str>, operation: F) -> T
    where
        F: FnOnce() -> T,
    {
        let normalized = normalize_key(key.as_ref());
        let _cleanup = KeyCleanupGuard {
            gates: Arc::clone(&self.gates),
            key: normalized.clone(),
        };
        let gate = self.acquire_gate(&normalized);

        let mut state = lock_unpoisoned(&gate.state);
        let my_ticket = state.next_ticket;
        state.next_ticket = state.next_ticket.wrapping_add(1);
        while state.serving_ticket != my_ticket {
            state = wait_unpoisoned(&gate.condvar, state);
        }
        drop(state);

        let _release = TicketReleaseGuard {
            gate: Arc::clone(&gate),
        };
        operation()
    }

    pub fn enqueue_path<T, F>(&self, path: &Path, operation: F) -> T
    where
        F: FnOnce() -> T,
    {
        self.enqueue(path.to_string_lossy().as_ref(), operation)
    }

    pub fn active_key_count(&self) -> usize {
        lock_unpoisoned(&self.gates).len()
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier, Mutex, mpsc};
    use std::thread;
    use std::time::Duration;

    use super::{FileOperationQueue, normalize_key};

    #[test]
    fn normalizes_paths_consistently() {
        assert_eq!(normalize_key("a/./b/../c.json"), "a/c.json");
        assert_eq!(normalize_key("a\\b\\c.json"), "a/b/c.json");
        if cfg!(windows) {
            assert_eq!(
                normalize_key("C:\\Users\\BaseApp\\config.json"),
                normalize_key("c:/users/baseapp/./config.json")
            );
        }
    }

    #[test]
    fn serializes_same_key_in_fifo_order_and_cleans_up() {
        let queue = FileOperationQueue::new();
        let log = Arc::new(Mutex::new(Vec::<String>::new()));
        let active_in_alpha = Arc::new(AtomicUsize::new(0));
        let overlap_detected = Arc::new(AtomicBool::new(false));
        let (first_started_tx, first_started_rx) = mpsc::channel();
        let (release_first_tx, release_first_rx) = mpsc::channel();

        let q1 = queue.clone();
        let log1 = Arc::clone(&log);
        let active1 = Arc::clone(&active_in_alpha);
        let overlap1 = Arc::clone(&overlap_detected);
        let t1 = thread::spawn(move || {
            q1.enqueue("alpha", move || {
                if active1.fetch_add(1, Ordering::SeqCst) != 0 {
                    overlap1.store(true, Ordering::SeqCst);
                }
                log1.lock().unwrap().push("alpha:1:start".to_string());
                first_started_tx.send(()).unwrap();
                release_first_rx.recv().unwrap();
                log1.lock().unwrap().push("alpha:1:end".to_string());
                active1.fetch_sub(1, Ordering::SeqCst);
                "one"
            })
        });

        first_started_rx.recv().unwrap();

        let q2 = queue.clone();
        let log2 = Arc::clone(&log);
        let active2 = Arc::clone(&active_in_alpha);
        let overlap2 = Arc::clone(&overlap_detected);
        let t2 = thread::spawn(move || {
            q2.enqueue("alpha", move || {
                if active2.fetch_add(1, Ordering::SeqCst) != 0 {
                    overlap2.store(true, Ordering::SeqCst);
                }
                log2.lock().unwrap().push("alpha:2:start".to_string());
                thread::sleep(Duration::from_millis(15));
                log2.lock().unwrap().push("alpha:2:end".to_string());
                active2.fetch_sub(1, Ordering::SeqCst);
                Err::<&str, &str>("alpha-failed")
            })
        });

        thread::sleep(Duration::from_millis(20));

        let q3 = queue.clone();
        let log3 = Arc::clone(&log);
        let active3 = Arc::clone(&active_in_alpha);
        let overlap3 = Arc::clone(&overlap_detected);
        let t3 = thread::spawn(move || {
            q3.enqueue("alpha", move || {
                if active3.fetch_add(1, Ordering::SeqCst) != 0 {
                    overlap3.store(true, Ordering::SeqCst);
                }
                log3.lock().unwrap().push("alpha:3:start".to_string());
                log3.lock().unwrap().push("alpha:3:end".to_string());
                active3.fetch_sub(1, Ordering::SeqCst);
                "three"
            })
        });

        thread::sleep(Duration::from_millis(20));
        release_first_tx.send(()).unwrap();

        assert_eq!(t1.join().unwrap(), "one");
        assert_eq!(t2.join().unwrap(), Err("alpha-failed"));
        assert_eq!(t3.join().unwrap(), "three");
        assert!(!overlap_detected.load(Ordering::SeqCst));

        let events = log.lock().unwrap().clone();
        assert_eq!(
            events,
            vec![
                "alpha:1:start",
                "alpha:1:end",
                "alpha:2:start",
                "alpha:2:end",
                "alpha:3:start",
                "alpha:3:end",
            ]
        );
        assert_eq!(queue.active_key_count(), 0);
    }

    #[test]
    fn allows_distinct_keys_to_run_concurrently() {
        let queue = FileOperationQueue::new();
        let barrier = Arc::new(Barrier::new(2));

        let q_alpha = queue.clone();
        let b_alpha = Arc::clone(&barrier);
        let t_alpha = thread::spawn(move || {
            q_alpha.enqueue_path(Path::new("dir/alpha.json"), move || {
                b_alpha.wait();
                "alpha"
            })
        });

        let q_beta = queue.clone();
        let b_beta = Arc::clone(&barrier);
        let t_beta = thread::spawn(move || {
            q_beta.enqueue_path(Path::new("dir/beta.json"), move || {
                b_beta.wait();
                "beta"
            })
        });

        assert_eq!(t_alpha.join().unwrap(), "alpha");
        assert_eq!(t_beta.join().unwrap(), "beta");
        assert_eq!(queue.active_key_count(), 0);
    }

    #[test]
    fn recovers_cleanly_after_operation_panic() {
        let queue = FileOperationQueue::new();
        let q1 = queue.clone();
        let panicked = thread::spawn(move || {
            q1.enqueue("panic-key", || {
                panic!("simulated failure");
            });
        })
        .join();
        assert!(panicked.is_err());

        let recovered = queue.enqueue("panic-key", || 42_u32);
        assert_eq!(recovered, 42);
        assert_eq!(queue.active_key_count(), 0);
    }
}

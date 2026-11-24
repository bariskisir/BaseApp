use std::collections::HashSet;

use thiserror::Error;
use url::Url;

use crate::product::{ProductInfo, default_product_info};

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ExternalUrlError {
    #[error("Invalid external URL.")]
    InvalidUrl,
    #[error("This URL is not allowed.")]
    NotAllowed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalUrlPolicy {
    allowed_hosts: HashSet<String>,
}

impl ExternalUrlPolicy {
    pub fn new<I, S>(allowed_hosts: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let normalized = allowed_hosts
            .into_iter()
            .map(|host| host.as_ref().trim().to_ascii_lowercase())
            .filter(|host| !host.is_empty())
            .collect();
        Self {
            allowed_hosts: normalized,
        }
    }

    pub fn from_product(product: &ProductInfo) -> Self {
        Self::new(&product.allowed_external_hosts)
    }

    pub fn is_allowed(&self, raw_url: &str) -> bool {
        self.assert_allowed(raw_url).is_ok()
    }

    pub fn assert_allowed(&self, raw_url: &str) -> Result<Url, ExternalUrlError> {
        let parsed = Url::parse(raw_url).map_err(|_| ExternalUrlError::InvalidUrl)?;
        if parsed.scheme() != "https" {
            return Err(ExternalUrlError::NotAllowed);
        }
        if !parsed.username().is_empty() || parsed.password().is_some() {
            return Err(ExternalUrlError::NotAllowed);
        }
        if parsed.port().is_some() {
            return Err(ExternalUrlError::NotAllowed);
        }
        let Some(host) = parsed.host_str() else {
            return Err(ExternalUrlError::NotAllowed);
        };
        if !self.allowed_hosts.contains(&host.to_ascii_lowercase()) {
            return Err(ExternalUrlError::NotAllowed);
        }
        Ok(parsed)
    }
}

impl Default for ExternalUrlPolicy {
    fn default() -> Self {
        Self::from_product(&default_product_info())
    }
}

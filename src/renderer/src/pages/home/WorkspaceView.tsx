/**
 * Provides a neutral landing surface for downstream applications.
 */

import { Blocks, Database, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../build/icon.svg'
import styles from './WorkspaceView.module.scss'

/** Renders neutral starter guidance for applications built from this shell. */
const WorkspaceView = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <section className={styles.container}>
      <div className={styles.hero}>
        <img className={styles.logo} src={logoUrl} alt="" />
        <span className={styles.eyebrow}>{t('app.name')}</span>
        <h1>{t('workspace.title')}</h1>
        <p>{t('workspace.description')}</p>
        <div className={styles.features}>
          <article>
            <Blocks size={19} />
            <div>
              <strong>{t('workspace.shellTitle')}</strong>
              <span>{t('workspace.shellDescription')}</span>
            </div>
          </article>
          <article>
            <Database size={19} />
            <div>
              <strong>{t('workspace.sessionsTitle')}</strong>
              <span>{t('workspace.sessionsDescription')}</span>
            </div>
          </article>
          <article>
            <ShieldCheck size={19} />
            <div>
              <strong>{t('workspace.securityTitle')}</strong>
              <span>{t('workspace.securityDescription')}</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

export default WorkspaceView

import React, { type ReactNode } from 'react';
import type { Props } from '@theme/EditMetaRow';
import EditThisPage from '@theme/EditThisPage';
import LastUpdated from '@theme/LastUpdated';
import clsx from 'clsx';
import CopyPageButton from '../../components/CopyPageButton';
import styles from './styles.module.css';

export default function EditMetaRow({
  className,
  editUrl,
  lastUpdatedAt,
  lastUpdatedBy,
}: Props): ReactNode {
  return (
    <div className={clsx('row', className)}>
      <div className="col">
        <div className={styles.editSection}>
          {editUrl && <EditThisPage editUrl={editUrl} />}
          <CopyPageButton />
        </div>
      </div>
      <div className={clsx('col', styles.lastUpdated)}>
        {(lastUpdatedAt || lastUpdatedBy) && (
          <LastUpdated lastUpdatedAt={lastUpdatedAt} lastUpdatedBy={lastUpdatedBy} />
        )}
      </div>
    </div>
  );
}

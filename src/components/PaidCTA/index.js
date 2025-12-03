import React from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './index.module.css';

export default function PaidCTA({
  to = '/how-to-study/intro/full-service',
  children,
  className,
}) {
  const label = '👉 点击解锁全部付费内容';
  return (
    <div className={clsx(styles.wrapper, className)}>
      <Link className={styles.cta} to={to}>
        {children ?? label}
      </Link>
    </div>
  );
}



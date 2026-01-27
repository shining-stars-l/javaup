import React, { useState } from 'react';
import styles from './styles.module.css';

export default function LimitedOffer() {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (isCollapsed) {
    return (
      <div className={styles.collapsedWrapper} onClick={() => setIsCollapsed(false)}>
        <span className={styles.collapsedIcon}>🎁</span>
        <span className={styles.badge}>优惠</span>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.tag}>限时优惠</span>
        <button 
          className={styles.closeBtn} 
          onClick={() => setIsCollapsed(true)}
          aria-label="收起"
        >
          ×
        </button>
      </div>
      <div className={styles.content}>
        <p className={styles.text}>
          扫码关注，发送<span className={styles.keyword}> 优惠 </span>关键字，<br/>
          领取限时优惠券呦！
        </p>
        <div className={styles.qrWrapper}>
          <img 
            src="/img/person/gongZhongHao.jpg" 
            alt="微信公众号" 
            className={styles.qrCode}
          />
        </div>
      </div>
    </div>
  );
}

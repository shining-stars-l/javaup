import React from 'react';
import styles from './styles.module.css';

function normalizeSize(value) {
  if (!value) {
    return undefined;
  }

  return /^\d+$/.test(value) ? `${value}px` : value;
}

function getAlignmentClassName(align) {
  if (align === 'left') {
    return styles.alignLeft;
  }

  if (align === 'right') {
    return styles.alignRight;
  }

  return styles.alignCenter;
}

export default function PlantUML({
  src,
  title = 'PlantUML 图',
  width,
  maxWidth,
  align = 'center',
}) {
  const resolvedWidth = normalizeSize(width);
  const resolvedMaxWidth = normalizeSize(maxWidth);
  const figureStyle = {
    width: resolvedWidth ? `min(100%, ${resolvedWidth})` : undefined,
    maxWidth: resolvedMaxWidth ? `min(100%, ${resolvedMaxWidth})` : undefined,
  };

  return (
    <figure
      className={`${styles.figure} ${getAlignmentClassName(align)}`}
      style={figureStyle}
    >
      <img
        className={styles.image}
        src={src}
        alt={title}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      {title ? <figcaption className={styles.caption}>{title}</figcaption> : null}
    </figure>
  );
}

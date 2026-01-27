import React from 'react';
import Layout from '@theme-original/DocItem/Layout';
import LimitedOffer from '@site/src/components/LimitedOffer';

export default function LayoutWrapper(props) {
  return (
    <>
      <Layout {...props} />
      <LimitedOffer />
    </>
  );
}

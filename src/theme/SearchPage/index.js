import React from 'react';
import Head from '@docusaurus/Head';
import SearchPage from '@theme-original/SearchPage';

export default function SearchPageWrapper(props) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <SearchPage {...props} />
    </>
  );
}

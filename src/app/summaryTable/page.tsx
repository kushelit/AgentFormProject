'use client';

import { Suspense } from "react";
import SummaryTable from "./SummaryTable";

const SummaryTablePage = () => {
  return (
    <Suspense>
      <SummaryTable />
    </Suspense>
  );
};

export default SummaryTablePage;
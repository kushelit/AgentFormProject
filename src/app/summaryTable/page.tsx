'use client';

import { Suspense } from "react";
import SummaryTable from "./SummaryTable";
import { useAuth } from "@/lib/firebase/AuthContext";


const SummaryTablePage = () => {
  return (
    <Suspense>    
      <SummaryTable />
    </Suspense>
  );
};

export default SummaryTablePage;
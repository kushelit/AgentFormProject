'use client';

import { Suspense } from "react";
import ManageWorkers from "./ManageWorkers";

const ManageWorkersPage = () => {
  return (
    <Suspense>
      <ManageWorkers />
    </Suspense>
  );
};

export default ManageWorkersPage;
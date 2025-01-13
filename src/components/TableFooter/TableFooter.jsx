import React from "react";
import Pagination from "../Pagination/Pagination";
import "./style.css";

const TableFooter = ({ currentPage, totalPages, onPageChange }) => {
  return (
    <div className="table-footer">
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        className="pagination-instance"
      />
    </div>
  );
};

export default TableFooter;

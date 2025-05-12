import React from "react";
import Pagination from "../Pagination/Pagination";
import "./style.css";

interface TableFooterProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (value: number) => void;
}

const TableFooter: React.FC<TableFooterProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  rowsPerPage,
  onRowsPerPageChange,
}) => {
  return (
    <div className="table-footer">
    <div className="left-section">
      <div className="rows-per-page-select">
        <label htmlFor="rows-per-page">רשומות לעמוד:</label>
        <select
          id="rows-per-page"
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={100}>100</option>
        </select>
      </div>
  
      <div className="pagination-info">
        עמוד {currentPage} מתוך {totalPages}
      </div>
    </div>
  
    <div className="pagination-instance">
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  </div>  
  );
};

export default TableFooter;

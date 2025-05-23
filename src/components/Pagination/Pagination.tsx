import React from "react";
import { PaginationArrows } from "../PaginationArrows/PaginationArrows";
import "./style.css";

// הגדרת טיפוסים לפרופס
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  className = ""
}) => {
  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleBack = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  return (
    <div className={`pagination ${className}`}>
      {/* כפתור אחורה */}
      <PaginationArrows
        type="back"
        state={currentPage === 1 ? "disabled" : "default"}
        onClick={handleBack}
        className="pagination-arrows-instance"
      />

      {/* מספר עמוד */}
      <span className="pagination-number">{currentPage}</span>

      {/* כפתור קדימה */}
      <PaginationArrows
        type="next"
        state={currentPage === totalPages ? "disabled" : "default"}
        onClick={handleNext}
        className="pagination-arrows-instance"
      />
    </div>
  );
};

export default Pagination;

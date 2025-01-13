import React from "react";
import "./style.css";

const Search = ({ className }) => {
  return (
    <img className={`search ${className}`} alt="Search" src="/static/img/search.png" />
  );
};

export default Search;

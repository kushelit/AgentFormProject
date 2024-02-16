import React from 'react'; // Import React (if using JSX and not imported elsewhere in your file)
import AgentForm from './AgentForm'; // Adjust the import path to where your AgentForm is located

const Page = () => {
  return (
    <div className="title-container">
      <h1>מערכת לניהול מכירות</h1>
      <AgentForm /> {/* This is where the AgentForm component is included */}
    </div>
  );
};

export default Page;

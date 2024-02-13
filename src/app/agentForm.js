import React, { useState } from 'react';
 import { db } from './firebase'; // Adjust the import path to where your Firebase initialization is

function AgentForm() {
    const [selectedAgent, setSelectedAgent] = useState('');
    const agents = ['Agent 1', 'Agent 2', 'Agent 3']; // Your agents list

    const handleAgentChange = (event) => {
        setSelectedAgent(event.target.value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!selectedAgent) {
            alert("Please select an agent before submitting.");
            return;
        }
        try {
            // Add a new document with a generated ID in Firestore collection "agents"
            await db.collection("agents").add({
                name: selectedAgent,
                timestamp: new Date(), // Optional: add a timestamp
            });
            console.log("Agent submitted successfully");
            alert("Agent submitted successfully");
            setSelectedAgent(''); // Reset selected agent after submission
        } catch (error) {
            console.error("Error adding document: ", error);
            alert("Error submitting agent");
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <label>
                Select an Agent:
                <select value={selectedAgent} onChange={handleAgentChange}>
                    <option value="">Please select</option>
                    {agents.map(agent => (
                        <option key={agent} value={agent}>{agent}</option>
                    ))}
                </select>
            </label>
            <button type="submit">Submit</button>
        </form>
    );
}

export default AgentForm;

function AgentData() {
    const agents = ['Agent 1', 'Agent 2', 'Agent 3']; // Your agent list

    return (
        <div>
            <h1>Agents</h1>
            <ul>
                {agents.map((agent, index) => (
                    <li key={index}>{agent}</li>
                ))}
            </ul>
        </div>
    );
}

export default AgentData;
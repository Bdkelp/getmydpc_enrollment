import React from "react";
import { useLocation } from "wouter";

export default function AgentCommissions() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Commission Tracking</h1>
      <p className="mt-4">Test 1: Added useLocation hook. If you see this, the hook works.</p>
      <button 
        onClick={() => setLocation("/agent/dashboard")}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Test Navigation
      </button>
    </div>
  );
}

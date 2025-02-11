import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Navbar from "components/Navbar";
import useStore from "store/useStore";
import AppRoutes from "routes";
import "./App.css";

const App: React.FC = () => {
  const { isLoading } = useStore();

  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <div className="content">
          {isLoading && <div className="loading-overlay">Loading...</div>}
          <AppRoutes />
        </div>
      </div>
    </Router>
  );
};

export default App;

import React from "react";
import { Routes, Route } from "react-router-dom";
import TimestampAdder from "./components/TimestampAdder";
import TimestampMultiView from "./components/TimestampMultiView";
import TimestampSingleView from "./components/TimestampSingleView";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/multi" element={<TimestampMultiView />} />
      <Route path="/single" element={<TimestampSingleView />} />
      <Route path="/add" element={<TimestampAdder />} />
    </Routes>
  );
};

export default AppRoutes;

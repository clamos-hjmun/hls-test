import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import TimestampAdder from "./components/TimestampAdder";
import TimestampMultiView from "./components/TimestampMultiView";
import TimestampSingleView from "./components/TimestampSingleView";
import TimestampMultiViewWithHls from "components/TimestampMultiViewWithHls";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/multi" replace />} />
      <Route path="/multi" element={<TimestampMultiViewWithHls />} />
      <Route path="/single" element={<TimestampSingleView />} />
      <Route path="/add" element={<TimestampAdder />} />
    </Routes>
  );
};

export default AppRoutes;

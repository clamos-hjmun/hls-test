import React from "react";
import { NavLink } from "react-router-dom";

const Navbar: React.FC = () => {
  const getNavClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

  return (
    <nav className="navbar">
      <NavLink to="/multi" className={getNavClass}>
        1. Timestamp Multi View with MP4
      </NavLink>
      <NavLink to="/single" className={getNavClass}>
        2. Timestamp Single View
      </NavLink>
      <NavLink to="/add" className={getNavClass}>
        3. Timestamp Adder
      </NavLink>
    </nav>
  );
};

export default Navbar;

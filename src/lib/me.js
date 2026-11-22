import { createContext, useContext } from "react";
export const MeCtx = createContext(null);
export const useMe = () => useContext(MeCtx);

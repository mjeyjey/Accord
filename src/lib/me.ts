import { createContext, useContext } from 'react';
import type { Me } from './api';

export const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;

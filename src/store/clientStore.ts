import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Client-side state store using Zustand
 * Persists display name across sessions
 */

interface ClientState {
  displayName: string | null;
  userId: string | null;
  currentLobbyId: string | null;
  currentLobbyCode: string | null;
  
  setDisplayName: (name: string) => void;
  setUserId: (id: string) => void;
  setCurrentLobby: (lobbyId: string, code: string) => void;
  clearCurrentLobby: () => void;
  reset: () => void;
}

export const useClientStore = create<ClientState>()(
  persist(
    (set) => ({
      displayName: null,
      userId: null,
      currentLobbyId: null,
      currentLobbyCode: null,

      setDisplayName: (name: string) => set({ displayName: name }),
      
      setUserId: (id: string) => set({ userId: id }),
      
      setCurrentLobby: (lobbyId: string, code: string) =>
        set({ currentLobbyId: lobbyId, currentLobbyCode: code }),
      
      clearCurrentLobby: () =>
        set({ currentLobbyId: null, currentLobbyCode: null }),
      
      reset: () =>
        set({
          displayName: null,
          userId: null,
          currentLobbyId: null,
          currentLobbyCode: null,
        }),
    }),
    {
      name: 'darkest-like-client',
      partialize: (state) => ({
        displayName: state.displayName,
      }),
    }
  )
);


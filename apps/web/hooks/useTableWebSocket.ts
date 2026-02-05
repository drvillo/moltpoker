import type { GameStatePayload, HandCompletePayload } from '@moltpoker/shared';
import { useEffect, useState, useRef } from 'react';

interface UseTableWebSocketOptions {
  mode?: 'admin' | 'observer';
  showCards?: boolean;
}

export function useTableWebSocket(
  tableId: string,
  options: UseTableWebSocketOptions = {}
): {
  connected: boolean;
  gameState: GameStatePayload | null;
  handComplete: HandCompletePayload | null;
  error: string | null;
} {
  const { mode = 'observer', showCards = false } = options;
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [handComplete, setHandComplete] = useState<HandCompletePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Build API URL from components or use fallback
    let apiUrl: string;
    if (process.env.NEXT_PUBLIC_API_URL) {
      // Backward compatibility
      apiUrl = process.env.NEXT_PUBLIC_API_URL;
    } else {
      // Build from components
      // NODE_ENV is available in Next.js (replaced at build time)
      const nodeEnv = process.env.NODE_ENV || 'development';
      const httpProtocol = nodeEnv === 'production' ? 'https' : 'http';
      const host = process.env.NEXT_PUBLIC_API_HOST || 'localhost';
      const port = process.env.NEXT_PUBLIC_API_PUBLIC_PORT || '9000';
      apiUrl = `${httpProtocol}://${host}:${port}`;
    }
    
    // Convert to WebSocket protocol
    const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const baseUrl = apiUrl.replace(/\/$/, ''); // Remove trailing slash
    const wsUrl = baseUrl.replace(/^https?:/, wsProtocol);

    let url: string;
    if (mode === 'observer') {
      const params = new URLSearchParams();
      if (showCards) params.set('showCards', 'true');
      url = `${wsUrl}/v1/ws/observe/${tableId}${params.toString() ? `?${params.toString()}` : ''}`;
    } else {
      // Admin mode would use regular WS endpoint with token
      url = `${wsUrl}/v1/ws?token=...`; // Would need token
    }

    function connect() {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'game_state') {
              setGameState(message.payload as GameStatePayload);
            } else if (message.type === 'hand_complete') {
              setHandComplete(message.payload as HandCompletePayload);
            } else if (message.type === 'error') {
              setError(message.payload.message || 'WebSocket error');
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          setConnected(false);
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        };
      } catch (err) {
        setError('Failed to create WebSocket connection');
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [tableId, mode, showCards]);

  return { connected, gameState, handComplete, error };
}

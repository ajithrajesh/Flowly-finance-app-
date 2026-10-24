import { io } from 'socket.io-client';
import { SOCKET_BASE, getToken } from './api';

let socketInstance = null;

export function getSocket() {
  const token = getToken();
  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  try {
    socketInstance = io(SOCKET_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      // Fetch initial unread count on connection
      socketInstance.emit('get_unread_count', (res) => {
        if (res?.ok && typeof res.unreadCount === 'number') {
          window.dispatchEvent(
            new CustomEvent('flowly:worker:unread-count', { detail: { unreadCount: res.unreadCount } })
          );
        }
      });
    });

    socketInstance.on('unread_count', (data) => {
      window.dispatchEvent(
        new CustomEvent('flowly:worker:unread-count', { detail: data })
      );
    });

    socketInstance.on('new_notification', (data) => {
      window.dispatchEvent(
        new CustomEvent('flowly:worker:new-notification', { detail: data })
      );
    });

    socketInstance.on('notification_read', (data) => {
      window.dispatchEvent(
        new CustomEvent('flowly:worker:notification-read', { detail: data })
      );
    });

    socketInstance.on('notifications_all_read', (data) => {
      window.dispatchEvent(
        new CustomEvent('flowly:worker:notifications-all-read', { detail: data })
      );
    });

    socketInstance.on('disconnect', () => {
      // disconnect event
    });
  } catch (err) {
    console.error('Failed to initialize worker socket:', err);
  }

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function markSocketNotificationRead(id) {
  if (socketInstance && socketInstance.connected) {
    socketInstance.emit('mark_read', { id });
  }
}

export function markAllSocketNotificationsRead() {
  if (socketInstance && socketInstance.connected) {
    socketInstance.emit('mark_all_read');
  }
}

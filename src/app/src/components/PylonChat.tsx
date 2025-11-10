import React, { useContext } from 'react';
import { UserContext } from '@app/contexts/UserContextDef';

declare global {
  interface Window {
    pylon?: {
      chat_settings: {
        app_id: string;
        email?: string;
        name?: string;
        avatar_url?: string;
        email_hash?: string;
        account_id?: string;
        account_external_id?: string;
      };
    };
    Pylon?: any;
  }
}

const PylonChat = () => {
  const userContext = useContext(UserContext);

  React.useEffect(() => {
    if (import.meta.env.VITE_PROMPTFOO_NO_CHAT) {
      return;
    }

    // Configure Pylon chat settings
    if (userContext?.email && !userContext.isLoading) {
      window.pylon = {
        chat_settings: {
          app_id: 'f8db82c2-b988-49b8-815a-c3c095722397',
          email: userContext.email,
          name: userContext.email,
        },
      };
    } else {
      window.pylon = {
        chat_settings: {
          app_id: 'f8db82c2-b988-49b8-815a-c3c095722397',
        },
      };
    }
  }, [userContext?.email, userContext?.isLoading]);

  return null;
};

export default PylonChat;

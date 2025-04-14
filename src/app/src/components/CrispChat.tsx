import React from 'react';

const CrispChat = () => {
  React.useEffect(() => {
    if (import.meta.env.VITE_PROMPTFOO_NO_CHAT) {
      return;
    }
    // @ts-ignore
    window.$crisp = [];
    // @ts-ignore
    window.CRISP_WEBSITE_ID = '5f523c31-098f-4014-8007-8d5610c86795';

    // Load Crisp chat script
    const script = document.createElement('script');
    script.src = 'https://client.crisp.chat/l.js';
    script.async = true;
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return null;
};

export default CrispChat;

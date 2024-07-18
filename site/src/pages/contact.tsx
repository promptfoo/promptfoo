import Cal, { getCalApi } from '@calcom/embed-react';
import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import styles from './contact.module.css';

function ContactForm() {
  useEffect(() => {
    (async function () {
      const cal = await getCalApi({});
      cal('ui', {
        styles: { branding: { brandColor: '#000000' } },
        hideEventTypeDetails: false,
        layout: 'month_view',
      });
    })();
  }, []);

  return (
    <div className={styles.calendarContainer}>
      <Cal
        calLink="team/promptfoo/intro2"
        style={{ width: '100%', height: '100%', overflow: 'scroll' }}
        config={{ layout: 'month_view' }}
      />
    </div>
  );
}

export default function Contact(): JSX.Element {
  return (
    <Layout title="Contact Us" description="Schedule a meeting with the promptfoo team">
      <Container maxWidth="md">
        <Box sx={{ my: 4, textAlign: 'center' }}>
          <Typography variant="h3" gutterBottom>
            Chat with us
          </Typography>
        </Box>
        <Box mb={4}>
          <ContactForm />
        </Box>
        <Box my={4}>
          <Typography variant="body1" gutterBottom>
            Email us at <Link href="mailto:inquiries@promptfoo.dev">inquiries@promptfoo.dev</Link>
          </Typography>
          <Typography variant="body1">
            Join our{' '}
            <Link href="https://discord.gg/gHPS9jjfbs" target="_blank" rel="noopener noreferrer">
              Discord
            </Link>
          </Typography>
        </Box>
      </Container>
    </Layout>
  );
}

import Cal, { getCalApi } from '@calcom/embed-react';
import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import styles from './contact.module.css';

function Calendar() {
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`contact-tabpanel-${index}`}
      aria-labelledby={`contact-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Contact(): JSX.Element {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Layout title="Contact Us" description="Schedule a meeting with the promptfoo team">
      <Container maxWidth="md">
        <Box sx={{ my: 4, textAlign: 'center' }}>
          <Typography variant="h3" gutterBottom>
            Chat with us
          </Typography>
        </Box>

        <Box my={4}>
          <Typography variant="body1" gutterBottom>
            <strong>Ways to get in touch:</strong>
          </Typography>
          <Typography variant="body1" gutterBottom>
            💬 Join our{' '}
            <Link href="https://discord.gg/gHPS9jjfbs" target="_blank">
              Discord
            </Link>
          </Typography>
          <Typography variant="body1" gutterBottom>
            🐙 Visit our{' '}
            <Link href="https://github.com/promptfoo/promptfoo" target="_blank">
              GitHub
            </Link>
          </Typography>
          <Typography variant="body1" gutterBottom>
            ✉️ Email us at{' '}
            <Link href="mailto:inquiries@promptfoo.dev">inquiries@promptfoo.dev</Link>
          </Typography>
          <Typography variant="body1" gutterBottom>
            📅 Or book a time below
          </Typography>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="contact tabs">
            <Tab label={<strong>Schedule a Meeting</strong>} />
            <Tab label={<strong>Contact Form</strong>} />
          </Tabs>
        </Box>
        <Box mb={8}>
          <TabPanel value={tabValue} index={0}>
            <Calendar />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <form action="https://submit-form.com/ghriv7voL" className={styles.contactForm}>
              <TextField
                fullWidth
                id="name"
                name="name"
                label="Your Name"
                variant="outlined"
                required
                margin="normal"
              />
              <TextField
                fullWidth
                id="email"
                name="email"
                label="Work Email"
                type="email"
                variant="outlined"
                required
                margin="normal"
              />
              <TextField
                fullWidth
                id="company"
                name="company"
                label="Company Name"
                variant="outlined"
                required
                margin="normal"
              />
              <FormControl fullWidth margin="normal" variant="outlined" required>
                <InputLabel id="interested-in-label">Interested In</InputLabel>
                <Select
                  labelId="interested-in-label"
                  id="interested-in"
                  name="interested-in"
                  label="Interested In"
                >
                  <MenuItem value="Security/red teaming">Security/red teaming</MenuItem>
                  <MenuItem value="Evaluations">Evaluations</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                id="meeting-about"
                name="meeting-about"
                label="I want to discuss..."
                multiline
                rows={4}
                variant="outlined"
                required
                margin="normal"
              />
              <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }}>
                Send
              </Button>
            </form>
          </TabPanel>
        </Box>
      </Container>
    </Layout>
  );
}

import Cal, { getCalApi } from '@calcom/embed-react';
import React, { useEffect, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
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
import { ThemeProvider, createTheme } from '@mui/material/styles';
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

function UpcomingEventsSection() {
  // Next few security events
  const upcomingEvents = [
    {
      id: 2,
      name: 'BSides SF 2025',
      displayDate: 'April 26-27, 2025',
      startDate: '2025-04-26',
      endDate: '2025-04-27',
      location: 'San Francisco, CA',
    },
    {
      id: 4,
      name: 'RSA Conference USA 2025',
      displayDate: 'April 28-May 1, 2025',
      startDate: '2025-04-28',
      endDate: '2025-05-01',
      location: 'San Francisco, CA',
    },
    {
      id: 1,
      name: 'DEF CON 33',
      displayDate: 'August 7-10, 2025',
      startDate: '2025-08-07',
      endDate: '2025-08-10',
      location: 'Las Vegas, NV',
    },
  ];

  // Sort by the closest upcoming date
  const sortedEvents = [...upcomingEvents].sort((a, b) => {
    const dateA = new Date(a.startDate);
    const dateB = new Date(b.startDate);

    return dateA.getTime() - dateB.getTime();
  });

  return (
    <Box my={4} className={styles.upcomingEventsSection}>
      <Typography variant="h5" gutterBottom className={styles.upcomingEventsTitle}>
        <CalendarTodayIcon className={styles.upcomingEventsIcon} />
        Meet Us In Person
      </Typography>
      <Typography variant="body1" paragraph>
        The promptfoo team will be at these upcoming security conferences. Connect with us to
        discuss LLM security and evaluation in person!
      </Typography>
      <div className={styles.upcomingEventsList}>
        {sortedEvents.map((event) => (
          <div key={event.id} className={styles.upcomingEventItem}>
            <Typography variant="subtitle1" className={styles.upcomingEventName}>
              {event.name}
            </Typography>
            <Typography variant="body2" className={styles.upcomingEventDetails}>
              {event.displayDate} · {event.location}
            </Typography>
          </div>
        ))}
      </div>
      <Button
        variant="outlined"
        component={Link}
        href="/events/"
        className={styles.upcomingEventsButton}
      >
        View All Events
      </Button>
    </Box>
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

function Contact(): JSX.Element {
  const isDarkTheme = useColorMode().colorMode === 'dark';
  const [tabValue, setTabValue] = useState(0);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkTheme ? 'dark' : 'light',
        },
      }),
    [isDarkTheme],
  );

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md">
        <Box
          sx={{
            my: 4,
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
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
            <Link href="https://discord.gg/promptfoo" target="_blank">
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
              <Button type="submit" variant="contained" color="primary" sx={{ mt: 6 }}>
                Send
              </Button>
            </form>
          </TabPanel>
        </Box>

        <UpcomingEventsSection />
      </Container>
    </ThemeProvider>
  );
}

export default function Page(): JSX.Element {
  return (
    <Layout title="Contact Us" description="Schedule a meeting with the promptfoo team">
      <Contact />
    </Layout>
  );
}

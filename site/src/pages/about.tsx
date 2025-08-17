import React from 'react';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Layout from '@theme/Layout';

const AboutPageContent = () => {
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
        },
      }),
    [colorMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box py={8}>
          <Typography variant="h2" component="h2" align="center" gutterBottom fontWeight="bold">
            Securing the Future of AI
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            Promptfoo helps developers and enterprises build secure, reliable AI applications.
          </Typography>
        </Box>

        <Box mb={8}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
                About Us
              </Typography>
              <Typography variant="body1" paragraph>
                We are security and engineering practitioners who have scaled generative AI products
                to hundreds of millions of users. We're building the tools that we wished we had
                when we were on the front lines.
              </Typography>
              <Typography variant="body1" paragraph>
                Based in San Mateo, California, we're backed by Andreessen Horowitz and top leaders
                in the technology and security industries.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <img
                  src="/img/logo-panda.svg"
                  alt="Promptfoo Logo"
                  style={{ maxWidth: '100%', maxHeight: '150px', height: 'auto' }}
                />
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" mb={8} fontWeight="medium">
            Meet the team
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[
              {
                name: 'Ian Webster',
                title: 'CEO & Co-founder',
                image: '/img/team/ian.jpeg',
                bio: 'Ian previously led LLM engineering and developer platform teams at Discord, scaling AI products to 200M users while maintaining rigorous safety, security, and policy standards.',
              },
              {
                name: "Michael D'Angelo",
                title: 'CTO & Co-founder',
                image: '/img/team/michael.jpeg',
                bio: 'Michael brings extensive experience in AI and engineering leadership. As the former VP of Engineering and Head of AI at Smile Identity, he has a track record of scaling ML solutions to serve over 100 million people across hundreds of enterprises.',
              },
              {
                name: 'Lily Liu',
                title: 'Business Operations Lead',
                image: '/img/team/lily.jpeg',
                bio: 'Lily brings investment and operational expertise from CVC Capital Partners and Evercore, where she spent five years evaluating software companies and tech M&A deals. At Promptfoo, she builds the systems and processes that enable our rapid growth while maintaining operational excellence. She holds a BS in Computer Science from Stanford.',
              },
              {
                name: 'Steve Klein',
                title: 'Staff Engineer',
                image: '/img/team/steve.jpeg',
                bio: `Steve brings decades of expertise in engineering, product, and cybersecurity. He has led technical and product teams, and conducted pentests at companies like Microsoft, Shopify, Intercom, and PwC. Most recently he was scaling AI products at Discord.`,
              },
              {
                name: 'Matthew Bou',
                title: 'Enterprise GTM Lead',
                image: '/img/team/matt.jpeg',
                bio: "Matt's a three-time founding sales team member with a track record of building GTM from scratch. He's helped startups land and grow Fortune 500 accounts, leading to three exits. At Promptfoo, he leads enterprise sales, helping teams accelerate and secure LLMs.",
              },
              {
                name: 'Ben Shipley',
                title: 'Enterprise GTM Lead',
                image: '/img/team/ben.jpeg',
                bio: 'Ben brings go-to-market expertise as an early GTM hire at multiple high-growth startups including Windsurf, Applied Intuition, and Amplitude. He specializes in building strategic relationships and helping enterprises implement and secure their AI solutions.',
              },
              {
                name: 'Vanessa Sauter',
                title: 'Principal Solutions Architect',
                image: '/img/team/vanessa.jpeg',
                bio: 'Vanessa led hundreds of security and privacy reviews for customers at Gong. She has also pentested dozens of enterprises and launched hundreds of bug bounty programs for a leading crowdsourced security company and is published in Forbes, Lawfare, and Dark Reading.',
              },
              {
                name: 'Guangshuo Zang',
                title: 'Staff Engineer',
                image: '/img/team/shuo.jpeg',
                bio: 'Guangshuo brings technical expertise from Meta, ChipperCash, and Smile Identity. Specializes in GenAI systems, product engineering, and building scalable client solutions.',
              },
              {
                name: 'Faizan Minhas',
                title: 'Senior Engineer',
                image: '/img/team/faizan.jpeg',
                bio: 'Faizan brings a wealth of experience in building products across a range of industries. He has led and contributed to projects at companies like Faire, Intercom, and a range of startups.',
              },
              {
                name: 'Will Holley',
                title: 'Senior Engineer',
                image: '/img/team/will.jpeg',
                bio: 'Will has a passion for building secure and reliable systems. He brings experience leading teams that develop AI for the financial services industry.',
              },
              {
                name: 'Asmi Gulati',
                title: 'AI Red Team',
                image: '/img/team/asmi.jpeg',
                bio: 'Asmi specializes in prompt hacking and develops educational content for Promptfoo. In her free time she maintains <a href="https://aisimplyexplained.com/" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">AI Simply Explained</a>.',
              },
              {
                name: 'Tabs Fakier',
                title: 'Founding Developer Advocate',
                image: '/img/team/tabs.jpeg',
                bio: 'Tabs fronts developer education, community management, and technical writing backed by a wealth of experience in design and software development. Learn more at your <a href="https://ladyofcode.com" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">own peril</a>.',
              },
            ].map((leader) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={leader.name}>
                <Box textAlign="center">
                  <Avatar
                    alt={leader.name}
                    src={leader.image}
                    sx={{ width: 150, height: 150, margin: '0 auto 1rem' }}
                  />
                  <Typography variant="h6" component="h4" gutterBottom fontWeight="medium">
                    {leader.name}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                    {leader.title}
                  </Typography>
                  <Typography variant="body2" dangerouslySetInnerHTML={{ __html: leader.bio }} />
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" fontWeight="medium" mb={4}>
            Backed by Industry Leaders
          </Typography>
          <Typography variant="body1" align="center" paragraph mb={8}>
            We're honored to have the support of top investors and industry experts who share our
            vision for open-source, application-focused AI security.
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            {[
              {
                name: 'Zane Lackey',
                image: '/img/team/zane.jpeg',
                description: 'General Partner, Andreessen Horowitz\nFounder, Signal Sciences',
              },
              {
                name: 'Joel de la Garza',
                image: '/img/team/joel.jpeg',
                description: 'Investment Partner, Andreessen Horowitz\nCISO, Box',
              },
              {
                name: 'Tobi Lutke',
                image: '/img/team/tobi.jpeg',
                description: 'CEO, Shopify',
              },
              {
                name: 'Stanislav Vishnevskiy',
                image: '/img/team/stan.jpeg',
                description: 'CTO, Discord',
              },
              {
                name: 'Frederic Kerrest',
                image: '/img/team/frederic.jpeg',
                description: 'Vice-Chairman & Co-Founder, Okta',
              },
              {
                name: 'Adam Ely',
                image: '/img/team/adam.jpeg',
                description: 'EVP, Head of Digital Products, Fidelity\nCISO, Fidelity',
              },
            ].map((investor) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={investor.name}>
                <Box textAlign="center">
                  <Avatar
                    alt={investor.name}
                    src={investor.image}
                    sx={{ width: 120, height: 120, margin: '0 auto 1rem' }}
                  />
                  <Typography variant="h6" component="h4" gutterBottom fontWeight="medium">
                    {investor.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {investor.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        <Box mb={8}>
          <Typography variant="h4" component="h3" align="center" gutterBottom fontWeight="medium">
            An Incredible Open Source Community
          </Typography>
          <Typography variant="body1" paragraph align="center">
            Promptfoo is proud to be supported by a vibrant community of over 150 open source
            contributors.
          </Typography>
          <Box display="flex" justifyContent="center" mt={4}>
            <a href="https://github.com/promptfoo/promptfoo/graphs/contributors">
              <img
                src="https://contrib.rocks/image?repo=promptfoo/promptfoo"
                alt="Promptfoo Contributors"
              />
            </a>
          </Box>
        </Box>

        <Box textAlign="center" mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Ready to Secure Your AI Applications?
          </Typography>
          <Typography variant="body1" paragraph>
            Join leading enterprises who trust Promptfoo to fortify their AI applications.
          </Typography>
          <Link className="button button--primary button--lg" to="/contact/">
            Get in Touch
          </Link>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const AboutPage = () => {
  return (
    <Layout
      title="About Promptfoo | AI Security Experts"
      description="Learn about Promptfoo's mission to secure AI applications and our team of industry veterans."
    >
      <AboutPageContent />
    </Layout>
  );
};

export default AboutPage;

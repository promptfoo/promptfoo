import React from 'react';
import Link from '@docusaurus/Link';
import { Typography, Grid, Box, Container, Avatar, Divider } from '@mui/material';
import Layout from '@theme/Layout';

const AboutPage = () => {
  return (
    <Layout
      title="About Promptfoo | AI Security Experts"
      description="Learn about Promptfoo's mission to secure AI applications and our team of industry veterans."
    >
      <Container maxWidth="lg">
        <Box py={8}>
          <Typography variant="h1" component="h1" align="center" gutterBottom fontWeight="bold">
            Securing the Future of AI
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            Promptfoo helps developers and enterprises build secure, reliable AI applications.
          </Typography>
        </Box>

        <Box mb={8}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
                About Us
              </Typography>
              <Typography variant="body1" paragraph>
                We are security and engineering practioners who have scaled generative AI products
                100s of millions of users. We're building the tools that we wished we had when we
                were on the front lines.
              </Typography>
              <Typography variant="body1" paragraph>
                Based in San Mateo, California, we're backed by Andreessen Horowitz and top leaders
                in the technology and security industries.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
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
                name: 'Steve Klein',
                title: 'Staff Engineer',
                image: '/img/team/steve.jpeg',
                bio: 'Steve brings decades of experience in engineering, product development, and security. Most recently, he scaled AI products at Discord.',
              },
            ].map((leader) => (
              <Grid item xs={12} sm={6} md={4} key={leader.name}>
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
                  <Typography variant="body2">{leader.bio}</Typography>
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
              <Grid item xs={12} sm={6} md={4} key={investor.name}>
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
                    sx={{ whiteSpace: 'pre-line' }}
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
            Promptfoo is proud to be supported by a vibrant community of over 100 open source
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
    </Layout>
  );
};

export default AboutPage;

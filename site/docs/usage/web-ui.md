---
sidebar_position: 30
sidebar_label: Web viewer
---

# Using the web viewer

The web viewer is an experimental, work-in-progress UI for viewing prompt outputs side-by-side.

To start it, run:

```sh
npx promptfoo@latest view
```

After you [run an eval](/docs/getting-started), the viewer will present the latest results in a view like this one:

![promptfoo web viewer](https://user-images.githubusercontent.com/310310/244891219-2b79e8f8-9b79-49e7-bffb-24cba18352f2.png)

Currently, the viewer is just an easier way to look at output. It automatically updates on every eval, and allows you to thumbs up/thumbs down individual outputs to more easily compare prompts.

Remember, you can always [output](/docs/configuration/parameters#output-file) to terminal, HTML, CSV, or JSON instead if you're looking for something more portable.

The web viewer is under development and will eventually include features such as: configuring and re-running evals and viewing history.

## Sharing

To get a URL that you can send to others, click the 'Share' button in the top right. This will generate a URL that others can load to view your config and results.

Shared data is temporarily stored on our servers, and permanently deleted after 2 weeks, at which point the URL will cease to function. Shared data is "private" in the sense that the UUID-based URL is unguessable, but if you publish your URL then anyone can access it (similar to a Github secret gist).

You can configure the web viewer to share to your own hosted Promptfoo instance by clicking on the API Settings button in the top right of the viewer.

[&raquo; More information on sharing](/docs/usage/sharing)

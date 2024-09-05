FROM node:20-alpine AS production

WORKDIR /app

ENV PROMPTFOO_HOSTED=true

RUN npm i -g promptfoo@latest

EXPOSE 15500

CMD ["promptfoo", "serve"]
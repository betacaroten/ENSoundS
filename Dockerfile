# Build stage: Vite produces the static dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run stage: serve the built dist/ with `serve`.
FROM node:24-alpine AS run
WORKDIR /app
RUN npm install --global --omit=dev serve@14
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-l", "3000", "dist"]

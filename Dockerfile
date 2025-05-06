FROM oven/bun:1.1.25-alpine AS builder
WORKDIR /app
RUN mkdir -p deps/solid-select

# Copy each dep's bun files over and bun install them
COPY deps/solid-select/package.json deps/solid-select/bun.lock deps/solid-select
RUN cd deps/solid-select && bun i

# Build each dep
COPY deps/solid-select/ deps/solid-select
RUN cd deps/solid-select && bun run build

# Copy the main package.json/bun.lock over and install the deps
# I tried to do this before building the deps. Doesn't work. Weird scuff
COPY package.json bun.lock .
RUN bun i

COPY . .
RUN bun run build

FROM oven/bun:1.1.25-alpine
WORKDIR /app/server

COPY server/package.json server/bun.lock .
RUN bun i

COPY server .
COPY --from=builder /app/dist /app/dist

EXPOSE 3000
VOLUME /app/data

CMD ["bun", "run", "start", "--expose-dist", "--host", "::", "--port", "3000"]

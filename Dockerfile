FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (if any)
RUN npm install --production 2>/dev/null || true

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8080

# Run the application
CMD ["node", "src/index.js"]

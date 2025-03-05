# 1. Node.js 기반 빌드 단계
FROM node:18 AS builder

# 2. 작업 디렉터리 설정
WORKDIR /app

# 3. package.json과 lock 파일 복사
COPY package.json package-lock.json ./

# 4. 의존성 설치
RUN npm install

# 5. 프로젝트 코드 복사
COPY . .

# 6. Vite 빌드 실행
RUN npm run build

# 7. Nginx 기반 배포 환경 설정
FROM nginx:alpine

# 8. Nginx 설정 복사
COPY nginx.conf /etc/nginx/nginx.conf

# 9. 빌드된 파일을 Nginx의 기본 루트에 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# 10. 컨테이너가 실행될 때 Nginx 실행
CMD ["nginx", "-g", "daemon off;"]

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import videoRoutes from "./router/videoRoutes";

const app = express();
const PORT = 4000;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());

// 라우트 설정
app.use("/api", videoRoutes);

// 서버 실행
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

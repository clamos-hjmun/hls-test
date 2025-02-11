import React, { useEffect, useRef, useState } from "react";
import Skeleton from "@mui/material/Skeleton";
import useStore from "store/useStore";
import serverConfig from "config";
import videojs from "video.js";
import "video.js/dist/video-js.css";

type Canvas = {
  id: number;
};

const TimestampAdder: React.FC = () => {
  const { setIsLoading } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mergedVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timelineImages, setTimelineImages] = useState<number[]>([]);
  const [duration, setDuration] = useState<number>(0);
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [ranges, setRanges] = useState<{ id: string; start: number; end: number }[]>([]);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [selectedRangeId, setSelectedRangeId] = useState<string | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);

  const SERVER_URL = serverConfig.url;

  // 비디오 초기화 및 메타데이터 로드 시 타임라인 생성
  useEffect(() => {
    if (videoRef.current) {
      const player = videojs(videoRef.current, {
        autoplay: false,
        controls: true,
        muted: true,
        preload: "auto",
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5],
        sources: [
          {
            src: `${SERVER_URL}/api/hls`,
            type: "application/x-mpegURL",
          },
        ],
      });

      player.on("loadedmetadata", () => {
        const duration = player.duration();
        setDuration(duration);
        generateTimeline(duration);
        setCanvases([{ id: Date.now() }]);
      });

      return () => {
        player.dispose();
      };
    }
  }, []);

  // 타임라인 이미지 생성 함수
  const generateTimeline = async (duration: number) => {
    if (!videoRef.current) return;

    const numImages = 10;
    const interval = duration / numImages;

    const video = videoRef.current;
    video.pause();

    try {
      const times = Array.from({ length: numImages }, (_, index) => index * interval);
      setTimelineImages(times);
    } catch (error) {
      console.error("Failed to generate timeline:", error);
    } finally {
      video.currentTime = 0;
      video.play();
    }
  };

  // 썸네일 클릭 시 비디오 재생 위치 이동
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    const canvas = e.target as HTMLCanvasElement;

    if (!canvas || !canvas.getBoundingClientRect) return;

    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const time = (mouseX / canvasRect.width) * duration;

    if (videoRef.current) {
      const player = videojs(videoRef.current);
      player.currentTime(time);
    }
  };

  useEffect(() => {
    document.addEventListener("mouseup", handleCanvasMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleCanvasMouseUp);
    };
  }, [selectionRange]);

  useEffect(() => {
    if (selectedRangeId && videoRef.current) {
      const player = videojs(videoRef.current);
      const selectionRange = ranges.find((range) => range.id === selectedRangeId);

      if (!selectionRange) return;

      const onTimeUpdate = () => {
        if (player.currentTime() >= selectionRange.end) {
          player.pause();
          player.off("timeupdate", onTimeUpdate);
        }
      };
      player.on("timeupdate", onTimeUpdate);

      if (selectionRange.start !== undefined) {
        player.currentTime(selectionRange.start);
        player.play();
      }

      return () => {
        player.off("timeupdate", onTimeUpdate);
      };
    }
  }, [selectedRangeId]);

  // 선택 범위 드래그 시작
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX - canvasRect.left;
    setDragStartX(startX);
    setSelectionRange(null);

    e.preventDefault();
  };

  // 선택 범위 드래그 진행
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragging || draggingHandle) return;

    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;

    const start = Math.min(dragStartX, mouseX);
    const end = Math.max(dragStartX, mouseX);

    const startTime = (start / canvasRect.width) * duration;
    const endTime = (end / canvasRect.width) * duration;

    setSelectionRange({ start: startTime, end: endTime });
  };

  // 선택 범위 드래그 종료
  const handleCanvasMouseUp = () => {
    setDragging(false);

    if (selectionRange) {
      setRanges((prevRanges) => [
        ...prevRanges,
        {
          id: `range-${Date.now()}`,
          start: selectionRange.start,
          end: selectionRange.end,
        },
      ]);

      // setSelectionRange(null);
    }
  };

  // 선택 범위 삭제
  const handleRangeRemove = () => {
    if (!selectedRangeId) {
      alert("삭제할 범위를 선택해주세요.");
      return;
    }

    setRanges((prevRanges) => prevRanges.filter((range) => range.id !== selectedRangeId));
    setSelectedRangeId(null);
  };

  // 선택 범위 병합 처리 함수
  const handleMerge = async () => {
    if (!ranges || ranges.length === 0) {
      alert("병합할 범위를 선택해 주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/merge-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ranges }),
      });

      if (!response.ok) {
        throw new Error("비디오 병합에 실패했습니다.");
      }

      const data = await response.blob();
      const downloadUrl = window.URL.createObjectURL(data);

      // 병합된 비디오를 mergedVideoRef에 로드
      if (mergedVideoRef.current) {
        mergedVideoRef.current.src = downloadUrl;
        mergedVideoRef.current.load();
        mergedVideoRef.current.play();
      }
    } catch (error) {
      console.error("비디오 병합 중 오류 발생:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 비디오의 currentTime을 기준으로 빨간 세로선을 그리는 함수
  const drawCurrentTimeLine = () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const video = videoRef.current;

    if (!context) return;

    const currentTime = video.currentTime;
    const canvasWidth = canvas.width;
    const lineX = (currentTime / duration) * canvasWidth;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.moveTo(lineX, 0);
    context.lineTo(lineX, canvas.height);
    context.strokeStyle = "red";
    context.lineWidth = 0.5;
    context.stroke();
  };

  // 비디오의 currentTime에 맞춰 세로선 갱신
  useEffect(() => {
    const updateTimeLine = () => {
      drawCurrentTimeLine();
      requestAnimationFrame(updateTimeLine);
    };

    requestAnimationFrame(updateTimeLine);
  }, [duration]);

  // 선택 범위 핸들 드래그 시작
  const handleMouseDownHandle = (rangeId: string, handleType: "start" | "end", event: React.MouseEvent) => {
    event.preventDefault();
    setDragging(true);
    setDraggingHandle(handleType);
    setSelectedRangeId(rangeId);
  };

  // 선택 범위 핸들 드래그 진행
  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingHandle || !selectedRangeId || !canvasRef.current) return;

    e.preventDefault();

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const time = (mouseX / canvasRect.width) * duration;

    // 선택된 범위 찾아서 드래그 시작/끝 위치를 수정
    setRanges((prevRanges) =>
      prevRanges.map((range) => {
        if (range.id === selectedRangeId) {
          if (draggingHandle === "start" && time < range.end) {
            return { ...range, start: Math.max(time, 0) };
          } else if (draggingHandle === "end" && time > range.start) {
            return { ...range, end: Math.min(time, duration) };
          }
        }
        return range;
      })
    );
  };

  // 선택 범위 핸들 드래그 종료
  const handleMouseUp = () => {
    setDragging(false);
    setDraggingHandle(null);
  };

  useEffect(() => {
    if (draggingHandle) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingHandle]);

  // 시간 포맷팅 함수
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const addCanvas = () => {
    setCanvases((prev) => [...prev, { id: Date.now() }]);
  };

  useEffect(() => {
    if (!selectionRange) return;
    console.log(selectionRange);
    console.log(`${(selectionRange.start / duration) * 100}%`);
    console.log(`${((selectionRange.end - selectionRange.start) / duration) * 100}%`);
  }, [selectionRange]);

  return (
    <div className="video-wrapper">
      <div className="video-player">
        <div
          style={{
            display: "relative",
            width: 800,
            height: 340,
          }}
        >
          {timelineImages.length === 0 && (
            <Skeleton
              variant="rectangular"
              width={"100%"}
              height={"100%"}
              animation="wave"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 800,
                height: 280,
              }}
            />
          )}
          <video
            ref={videoRef}
            className="video-js vjs-default-skin"
            controls
            preload="auto"
            width="800"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              visibility: timelineImages.length !== 0 ? "visible" : "hidden",
            }}
          />
        </div>

        <div style={{ width: "100%" }}>
          <div
            className="timeline-container"
            style={{
              position: "relative",
              display: "flex",
              marginLeft: "auto",
              justifyContent: "flex-end",
              backgroundColor: "#191b1d",
              width: "calc(100% - 65px)",
              height: "30px",
              marginBottom: "10px",
            }}
          >
            {timelineImages.map((thumbnail, index) => {
              return (
                <div
                  key={index}
                  className="timeline-thumbnail"
                  style={{ borderRight: "1px solid #333", width: "160px", height: "30px" }}
                >
                  <div className="timestamp" style={{ paddingLeft: "5px" }}>
                    {formatTime(thumbnail)}
                  </div>
                </div>
              );
            })}
            <canvas
              ref={canvasRef}
              className="timeline-canvas"
              width={160}
              height={90}
              style={{ backgroundColor: "#191b1d", opacity: 0.5 }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              width: 800,
              height: 500,
            }}
          >
            {canvases.map((canvas) => (
              <div key={canvas.id} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button onClick={addCanvas} className="canvas-btn">
                  추가
                </button>
                <canvas
                  width={730}
                  height={35}
                  style={{
                    position: "relative",
                    backgroundColor: "#f1f1f1",
                    cursor: "pointer",
                  }}
                  onDoubleClick={handleCanvasDoubleClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                >
                  {selectionRange && (
                    <div
                      className="selection-range"
                      style={{
                        left: `${(selectionRange.start / duration) * 100}%`,
                        width: `${((selectionRange.end - selectionRange.start) / duration) * 100}%`,
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        border: "1px solid #0056b3",
                      }}
                    ></div>
                  )}
                  <h1>{selectionRange?.start}</h1>
                </canvas>
              </div>
            ))}
          </div>

          {/* {canvases.map((canvas) => (
            <canvas
              key={canvas.id}
              width={160}
              height={90}
              className="timeline-canvas"
              style={{ backgroundColor: "#191b1d", opacity: 0.5 }}
              onDoubleClick={handleCanvasDoubleClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              {ranges.map((range) => (
                <div
                  key={range.id}
                  className="selection-range"
                  style={{
                    border: selectedRangeId === range.id ? "2px solid #0056b3" : "2px solid rgb(204, 204, 204)",
                    left: `${(range.start / duration) * 100}%`,
                    width: `${((range.end - range.start) / duration) * 100}%`,
                  }}
                  onClick={() => setSelectedRangeId(range.id)}
                >
                  <div
                    className="handle start-handle"
                    style={{ left: 0 }}
                    onMouseDown={(e) => handleMouseDownHandle(range.id, "start", e)}
                  />
                  <div
                    className="handle end-handle"
                    style={{ right: 0 }}
                    onMouseDown={(e) => handleMouseDownHandle(range.id, "end", e)}
                  />
                </div>
              ))}
              {selectionRange && (
                <div
                  className="selection-range"
                  style={{
                    left: `${(selectionRange.start / duration) * 100}%`,
                    width: `${((selectionRange.end - selectionRange.start) / duration) * 100}%`,
                  }}
                ></div>
              )}
            </canvas>
          ))} */}
        </div>
      </div>
      <video
        ref={mergedVideoRef}
        className="merged-video-container"
        controls
        preload="auto"
        style={{ height: "340px" }}
      />
    </div>
  );
};

export default TimestampAdder;

import { logger } from "@/lib/logger";
import { useState, useRef, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Image as ImageIcon,
  Video as VideoIcon,
  Upload,
  X,
  Home,
  Workflow as WorkflowIcon,
  FolderOpen,
  LogOut,
} from "lucide-react";
import WorkflowCanvas, {
  WorkflowCanvasRef,
} from "@/components/workflow/WorkflowCanvas";
import AssetLibrary, {
  AssetLibraryRef,
} from "@/components/library/AssetLibrary";
import WorkflowGallery from "@/components/workflow/WorkflowGallery";
import { useAuth } from "@/lib/AuthContext";
import { logOut, auth } from "@/lib/firebase";
import { API_ENDPOINTS } from "@/lib/api-config";
import Login from "./Login";
import { useToast } from "@/hooks/use-toast";
import { WorkflowProvider } from "@/contexts/WorkflowContext";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";

export default function Index() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const assetLibraryRef = useRef<AssetLibraryRef>(null);
  const workflowCanvasRef = useRef<WorkflowCanvasRef>(null);
  const [currentTab, setCurrentTab] = useState("home");
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [inlineLibraryTarget, setInlineLibraryTarget] = useState<{
    nodeId: string;
    assetType: "image" | "video";
  } | null>(null);

  const handleReferenceImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file && referenceImages.length < 9) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newImage = event.target?.result as string;
        setReferenceImages((prev) => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input value to allow uploading the same file again
    e.target.value = "";
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFirstFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFirstFrame(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLastFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLastFrame(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;

    setIsGeneratingImage(true);
    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();

      const response = await fetch(API_ENDPOINTS.generate.image, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: imagePrompt,
        }),
      });

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      if (data.images && data.images[0]) {
        const dataUri = `data:image/png;base64,${data.images[0]}`;
        setImageResult(dataUri);

        // ✅ Backend auto-saves images to library with prompt metadata
        // Just refresh the library to show the newly saved image
        if (assetLibraryRef.current) {
          assetLibraryRef.current.refresh();
        }
      }
    } catch (error) {
      console.error("Error generating image:", error);
      toast({
        title: "Error",
        description: "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;

    setIsGeneratingVideo(true);
    try {
      const currentUser = auth.currentUser;
      const token = await currentUser?.getIdToken();

      const response = await fetch(API_ENDPOINTS.generate.video, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: videoPrompt,
        }),
      });

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      const operationName = data.operation_name;

      let complete = false;
      while (!complete) {
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const statusToken = await currentUser?.getIdToken();
        const statusUrl = API_ENDPOINTS.generate.videoStatus(
          operationName,
          videoPrompt,
        );
        const statusResponse = await fetch(statusUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${statusToken}`,
          },
        });
        const statusData = await statusResponse.json();

        if (statusData.status === "complete") {
          complete = true;
          if (statusData.video_base64) {
            const dataUri = `data:video/mp4;base64,${statusData.video_base64}`;
            setVideoResult(dataUri);

            // ✅ Backend auto-saves videos to library with prompt metadata
            // Just refresh the library to show the newly saved video
            if (assetLibraryRef.current) {
              assetLibraryRef.current.refresh();
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating video:", error);
      toast({
        title: "Error",
        description: "Failed to generate video",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingVideo(false);
    }
  };


  const handleDownloadVideo = () => {
    if (!videoResult) return;
    const link = document.createElement("a");
    link.href = videoResult;
    link.download = `ai-video-${Date.now()}.mp4`;
    link.click();
  };

  const NavLink = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <button
      onClick={() => setCurrentTab(value)}
      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
        currentTab === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary"
      }`}
      title={label}
    >
      {Icon}
    </button>
  );

  // Listen for browse-library events from WorkflowCanvas
  useEffect(() => {
    const handleBrowseLibrary = () => {
      logger.debug("[Index] Browse library event received");
      setIsLibraryOpen(true);
    };

    window.addEventListener("browse-library", handleBrowseLibrary);
    return () =>
      window.removeEventListener("browse-library", handleBrowseLibrary);
  }, []);

  // Listen for inline asset library requests from nodes
  useEffect(() => {
    const handleOpenInlineLibrary = (event: Event) => {
      const customEvent = event as CustomEvent<{
        nodeId: string;
        assetType: "image" | "video";
      }>;
      const { nodeId, assetType } = customEvent.detail;

      logger.debug("[Index] Opening inline asset library:", {
        nodeId,
        assetType,
      });

      setInlineLibraryTarget({ nodeId, assetType });
      setIsLibraryOpen(true);
    };

    window.addEventListener(
      "open-asset-library-inline",
      handleOpenInlineLibrary
    );
    return () =>
      window.removeEventListener(
        "open-asset-library-inline",
        handleOpenInlineLibrary
      );
  }, []);

  // Handle adding asset from library to workflow
  const handleAddAssetNode = (asset: any) => {
    logger.debug("[Index] Adding asset to workflow:", asset);

    // Check if this is for an inline library request (specific node)
    if (inlineLibraryTarget) {
      logger.debug("[Index] Updating node with inline asset:", {
        nodeId: inlineLibraryTarget.nodeId,
        asset,
      });

      // Dispatch event to update specific node
      window.dispatchEvent(
        new CustomEvent("update-node-asset", {
          detail: {
            nodeId: inlineLibraryTarget.nodeId,
            assetType: inlineLibraryTarget.assetType,
            assetId: asset.id,
            url: asset.url,
            mimeType: asset.mime_type,
          },
        }),
      );

      // Clear inline library target
      setInlineLibraryTarget(null);
      setIsLibraryOpen(false);

      toast({
        title: "Asset loaded",
        description: `${inlineLibraryTarget.assetType === "video" ? "Video" : "Image"} loaded into node`,
      });
    } else {
      // Regular flow: Add new node to canvas
      window.dispatchEvent(
        new CustomEvent("add-asset-node", {
          detail: {
            assetId: asset.id,
            assetType: asset.asset_type,
            url: asset.url,
            mimeType: asset.mime_type,
          },
        }),
      );

      // Switch to workflow tab
      setCurrentTab("workflow");
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#360F46] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <WorkflowProvider>
        <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border">
          <div className="py-8 border-b border-border">
            <div className="px-4 flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <img
                  src="https://cdn.builder.io/api/v1/image/assets%2Fb1d3bf7cc0eb4f0daca65fdc5a7d5179%2F30fc0e70b75040f4858161ac143ab00c?format=webp&width=800"
                  alt="Sprocket"
                  className="w-10 h-10"
                />
                <h1 className="text-4xl font-bold" style={{ color: "#F8F5EE" }}>
                  HubSpot Gen Media Studio
                </h1>
              </div>

              {/* User Info & Sign Out */}
              {user && (
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {user.email}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await logOut();
                        toast({
                          title: "Signed out",
                          description: "You have been signed out successfully",
                        });
                      } catch (error) {
                        toast({
                          title: "Sign out failed",
                          description:
                            error instanceof Error
                              ? error.message
                              : "Unknown error",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>

          <nav className="px-4 py-4 flex gap-2 items-center justify-start overflow-x-auto border-b border-border">
            <NavLink
              icon={<Home className="w-5 h-5" />}
              label="Home"
              value="home"
            />
            <NavLink
              icon={<ImageIcon className="w-5 h-5" />}
              label="Image"
              value="image"
            />
            <NavLink
              icon={<VideoIcon className="w-5 h-5" />}
              label="Video"
              value="video"
            />
            <NavLink
              icon={<WorkflowIcon className="w-5 h-5" />}
              label="Workflow"
              value="workflow"
            />
            <button
              onClick={() => setIsLibraryOpen(true)}
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors text-muted-foreground hover:bg-secondary"
              title="Library"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
          </nav>
        </header>

        <div className="flex flex-1 gap-0">
          <div
            className={`flex-1 ${currentTab === "workflow" || currentTab === "image" || currentTab === "video" ? "max-w-none px-0 py-0" : "container mx-auto max-w-4xl px-4 py-8"}`}
          >
            <Tabs value={currentTab} className="w-full h-full">
              <TabsContent value="home" className="space-y-6">
                <WorkflowGallery
                  onLoadWorkflow={(workflow) => {
                    // Load templates (public workflows) as read-only
                    const readOnly = workflow.is_public === true;

                    // Switch to workflow tab FIRST to ensure canvas is mounted
                    setCurrentTab("workflow");

                    // Then load workflow after a small delay to ensure canvas is ready
                    setTimeout(() => {
                      if (workflowCanvasRef.current?.loadWorkflow) {
                        workflowCanvasRef.current.loadWorkflow(workflow, {
                          readOnly,
                        });
                      } else {
                        console.error(
                          "[Index] Failed to load workflow - canvas not ready",
                        );
                      }
                    }, 100);
                  }}
                />

              </TabsContent>

              <TabsContent value="image" className="h-full p-0">
                <div
                  className="grid gap-8 h-full p-6"
                  style={{ gridTemplateColumns: "340px 1fr" }}
                >
                  {/* Left Grid Area - Input Controls Card */}
                  <div className="flex">
                    <Card className="bg-[#41204E] border-[#41204E] p-6 w-full h-full flex flex-col">
                      <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                          <label
                            htmlFor="image-prompt"
                            className="block text-sm font-medium"
                          >
                            Describe your image:
                          </label>
                          <Textarea
                            id="image-prompt"
                            placeholder="A man holding a book"
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                            className="min-h-[100px] bg-[#2A1A3F] border-[#3D2D4F] text-white placeholder:text-gray-400 resize-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium">
                            Reference images: ({referenceImages.length}/9)
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {referenceImages.map((image, index) => (
                              <div
                                key={index}
                                className="relative rounded-lg overflow-hidden border border-[#3D2D4F] bg-[#2A1A3F] aspect-square"
                              >
                                <img
                                  src={image}
                                  alt={`Reference ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <Button
                                  onClick={() =>
                                    handleRemoveReferenceImage(index)
                                  }
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-1 right-1 h-5 w-5 bg-black/50 hover:bg-black/70"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                            {referenceImages.length < 9 && (
                              <label
                                htmlFor="reference-image"
                                className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-[#3D2D4F] rounded-lg cursor-pointer bg-[#2A1A3F] hover:bg-[#3D2D4F]/50 transition-colors"
                              >
                                <Upload className="w-5 h-5 text-gray-400" />
                                <input
                                  id="reference-image"
                                  type="file"
                                  className="hidden"
                                  accept="image/*"
                                  onChange={handleReferenceImageUpload}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium">
                            Aspect Ratio
                          </label>
                          <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="w-full px-3 py-2 bg-[#2A1A3F] border border-[#3D2D4F] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="1:1">1:1 Square</option>
                            <option value="16:9">16:9 Landscape</option>
                            <option value="9:16">9:16 Portrait</option>
                            <option value="4:3">4:3 Standard</option>
                            <option value="3:2">3:2 Classic</option>
                          </select>
                        </div>
                      </div>

                      <Button
                        onClick={handleGenerateImage}
                        disabled={!imagePrompt.trim() || isGeneratingImage}
                        className="w-full bg-[#9B6C94] hover:bg-[#8A5B84] text-white mt-4"
                        size="lg"
                      >
                        {isGeneratingImage ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          "Generate Image"
                        )}
                      </Button>
                    </Card>
                  </div>

                  {/* Right Grid Area - Result */}
                  {imageResult && (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                      <div
                        className="relative rounded-lg overflow-hidden bg-[#2A1A3F] border border-[#3D2D4F] max-w-full"
                        style={{ maxHeight: "calc(100% - 60px)" }}
                      >
                        <img
                          src={imageResult}
                          alt="Generated"
                          className="max-w-full max-h-full h-auto object-contain"
                        />
                        <Button
                          onClick={() => setImageResult(null)}
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex gap-3">
                        <Button className="bg-[#9B6C94] hover:bg-[#8A5B84] text-white px-8">
                          Upscale
                        </Button>
                        <Button
                          onClick={handleGenerateImage}
                          disabled={isGeneratingImage}
                          className="bg-[#9B6C94] hover:bg-[#8A5B84] text-white px-8"
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Empty state when no result */}
                  {!imageResult && !isGeneratingImage && (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-sm">
                          Generated image will appear here
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Loading state */}
                  {isGeneratingImage && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          Generating your image...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="video" className="h-full p-0">
                <div
                  className="grid gap-8 h-full p-6"
                  style={{ gridTemplateColumns: "340px 1fr" }}
                >
                  {/* Left Grid Area - Input Controls Card */}
                  <div className="flex">
                    <Card className="bg-[#41204E] border-[#41204E] p-6 w-full h-full flex flex-col">
                      <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                          <label
                            htmlFor="video-prompt"
                            className="block text-sm font-medium"
                          >
                            Describe your video:
                          </label>
                          <Textarea
                            id="video-prompt"
                            placeholder="A time-lapse of a bustling city transitioning from day to night..."
                            value={videoPrompt}
                            onChange={(e) => setVideoPrompt(e.target.value)}
                            className="min-h-[100px] bg-[#2A1A3F] border-[#3D2D4F] text-white placeholder:text-gray-400 resize-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium">
                            First Frame (Optional):
                          </label>
                          {firstFrame ? (
                            <div className="relative rounded-lg overflow-hidden border border-[#3D2D4F] bg-[#2A1A3F] aspect-video">
                              <img
                                src={firstFrame}
                                alt="First Frame"
                                className="w-full h-full object-cover"
                              />
                              <Button
                                onClick={() => setFirstFrame(null)}
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-5 w-5 bg-black/50 hover:bg-black/70"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <label
                              htmlFor="first-frame"
                              className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-[#3D2D4F] rounded-lg cursor-pointer bg-[#2A1A3F] hover:bg-[#3D2D4F]/50 transition-colors"
                            >
                              <div className="flex flex-col items-center justify-center">
                                <Upload className="w-5 h-5 mb-1 text-gray-400" />
                                <p className="text-xs text-gray-400">
                                  Click to upload
                                </p>
                              </div>
                              <input
                                id="first-frame"
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={handleFirstFrameUpload}
                              />
                            </label>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium">
                            Last Frame (Optional):
                          </label>
                          {lastFrame ? (
                            <div className="relative rounded-lg overflow-hidden border border-[#3D2D4F] bg-[#2A1A3F] aspect-video">
                              <img
                                src={lastFrame}
                                alt="Last Frame"
                                className="w-full h-full object-cover"
                              />
                              <Button
                                onClick={() => setLastFrame(null)}
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-5 w-5 bg-black/50 hover:bg-black/70"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <label
                              htmlFor="last-frame"
                              className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-[#3D2D4F] rounded-lg cursor-pointer bg-[#2A1A3F] hover:bg-[#3D2D4F]/50 transition-colors"
                            >
                              <div className="flex flex-col items-center justify-center">
                                <Upload className="w-5 h-5 mb-1 text-gray-400" />
                                <p className="text-xs text-gray-400">
                                  Click to upload
                                </p>
                              </div>
                              <input
                                id="last-frame"
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={handleLastFrameUpload}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <Button
                        onClick={handleGenerateVideo}
                        disabled={!videoPrompt.trim() || isGeneratingVideo}
                        className="w-full bg-[#9B6C94] hover:bg-[#8A5B84] text-white mt-4"
                        size="lg"
                      >
                        {isGeneratingVideo ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          "Generate Video"
                        )}
                      </Button>
                    </Card>
                  </div>

                  {/* Right Grid Area - Result */}
                  {videoResult && (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                      <div
                        className="relative rounded-lg overflow-hidden bg-[#2A1A3F] border border-[#3D2D4F] max-w-full"
                        style={{ maxHeight: "calc(100% - 60px)" }}
                      >
                        <video
                          src={videoResult}
                          controls
                          className="max-w-full max-h-full h-auto object-contain"
                        />
                        <Button
                          onClick={() => setVideoResult(null)}
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 bg-black/50 hover:bg-black/70"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={handleDownloadVideo}
                          className="bg-[#9B6C94] hover:bg-[#8A5B84] text-white px-8"
                        >
                          Download
                        </Button>
                        <Button
                          onClick={handleGenerateVideo}
                          disabled={isGeneratingVideo}
                          className="bg-[#9B6C94] hover:bg-[#8A5B84] text-white px-8"
                        >
                          Regenerate
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Empty state when no result */}
                  {!videoResult && !isGeneratingVideo && (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <VideoIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-sm">
                          Generated video will appear here
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Loading state */}
                  {isGeneratingVideo && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          Generating your video...
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="workflow" className="h-[calc(100vh-180px)]">
                <SectionErrorBoundary sectionName="Workflow Canvas">
                <WorkflowCanvas
                  ref={workflowCanvasRef}
                  onAssetGenerated={() => {
                    logger.debug("[Index] Asset generated callback triggered");
                    logger.debug(
                      "[Index] AssetLibrary ref:",
                      assetLibraryRef.current,
                    );
                    if (assetLibraryRef.current) {
                      logger.debug("[Index] Calling refresh on asset library");
                      assetLibraryRef.current.refresh();
                    } else {
                      console.warn(
                        "[Index] AssetLibrary ref is null, cannot refresh",
                      );
                    }
                  }}
                />
                </SectionErrorBoundary>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Asset Library */}
        <AssetLibrary
          ref={assetLibraryRef}
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
          onAddAssetNode={handleAddAssetNode}
        />
      </div>
      </WorkflowProvider>
    </ThemeProvider>
  );
}

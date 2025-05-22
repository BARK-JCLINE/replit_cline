import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OrderConfigurationForm } from "@/components/order-configuration-form";
import { OrderPreview } from "@/components/order-preview";
import { OrderHistory } from "@/components/order-history";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ShoppingCart, 
  HelpCircle, 
  Settings, 
  Play, 
  CheckCircle, 
  Download,
  Loader2
} from "lucide-react";
import type { 
  InsertOrderConfiguration, 
  OrderBatch, 
  OrderCreationProgress 
} from "@shared/schema";

export default function OrderGenerator() {
  const { toast } = useToast();
  const [orderConfig, setOrderConfig] = useState<InsertOrderConfiguration>({
    name: "Test Configuration",
    warehouse: "",
    address: "",
    lineItems: [{ productId: "", quantity: 1 }],
    subscriptionType: "",
    customerSegment: "",
    customTags: [],
    addressTemplate: "",
    stateProvince: "",
    orderCount: 1,
    customerFirstName: "",
    customerLastName: "",
    customerEmail: "",
    orderDelay: 0,
  });

  const [isCreatingOrders, setIsCreatingOrders] = useState(false);
  const [creationProgress, setCreationProgress] = useState<OrderCreationProgress>({
    percentage: 0,
    status: "",
    current: 0,
    total: 0,
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Fetch order batches for history
  const { data: orderBatches = [], refetch: refetchBatches } = useQuery<OrderBatch[]>({
    queryKey: ["/api/batches"],
  });

  // Fetch existing configurations for duplicate validation
  const { data: existingConfigurations = [] } = useQuery({
    queryKey: ["/api/configurations"],
  });

  // Validate configuration mutation
  const validateMutation = useMutation({
    mutationFn: async (config: InsertOrderConfiguration) => {
      const response = await apiRequest("POST", "/api/validate-configuration", config);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        toast({
          title: "Configuration Valid",
          description: "All required fields are properly configured.",
        });
      }
    },
    onError: (error: any) => {
      const errorData = error.message ? JSON.parse(error.message) : {};
      if (errorData.errors) {
        const errorMessages = errorData.errors.map((err: any) => `${err.field}: ${err.message}`).join(", ");
        toast({
          title: "Validation Errors",
          description: `Missing: ${errorMessages}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Validation Error",
          description: "Failed to validate configuration.",
          variant: "destructive",
        });
      }
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (config: InsertOrderConfiguration) => {
      const response = await apiRequest("POST", "/api/configurations", config);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Template Saved!",
        description: `Configuration "${data.name}" has been saved as a reusable template.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: "Failed to save configuration template. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create orders mutation
  const createOrdersMutation = useMutation({
    mutationFn: async (config: InsertOrderConfiguration) => {
      // First save the configuration
      const configResponse = await apiRequest("POST", "/api/configurations", config);
      const savedConfig = await configResponse.json();

      // Create batch
      const batchId = `BATCH-${Date.now()}`;
      const batchResponse = await apiRequest("POST", "/api/batches", {
        batchId,
        configurationId: savedConfig.id,
        orderCount: config.orderCount,
        status: "pending",
      });
      const batch = await batchResponse.json();

      // Start order creation
      const orderResponse = await apiRequest("POST", "/api/orders/create", {
        configurationId: savedConfig.id,
        batchId,
      });
      return orderResponse.json();
    },
    onSuccess: (data) => {
      setIsCreatingOrders(false);
      refetchBatches();
      toast({
        title: "Orders Created Successfully!",
        description: `${data.ordersCreated} test orders have been created and are ready for testing.`,
      });
    },
    onError: (error) => {
      setIsCreatingOrders(false);
      toast({
        title: "Order Creation Failed",
        description: "Failed to create test orders. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateOrders = async () => {
    // Basic validation
    if (!orderConfig.warehouse || !orderConfig.address) {
      toast({
        title: "Validation Error",
        description: "Please select warehouse and address before creating orders.",
        variant: "destructive",
      });
      return;
    }

    if (orderConfig.lineItems.filter(item => item.productId).length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one line item.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingOrders(true);
    setCreationProgress({
      percentage: 0,
      status: `0 of ${orderConfig.orderCount} orders created`,
      current: 0,
      total: orderConfig.orderCount,
    });

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setCreationProgress(prev => {
        const newCurrent = Math.min(prev.current + 1, prev.total);
        const percentage = (newCurrent / prev.total) * 100;
        return {
          ...prev,
          current: newCurrent,
          percentage: Math.round(percentage),
          status: `${newCurrent} of ${prev.total} orders created`,
        };
      });
    }, 1000);

    try {
      await createOrdersMutation.mutateAsync(orderConfig);
    } finally {
      clearInterval(progressInterval);
    }
  };

  const handleValidateConfig = () => {
    validateMutation.mutate(orderConfig);
  };

  const handleSaveTemplate = () => {
    setShowSaveDialog(true);
    setTemplateName(orderConfig.name || "");
  };

  const handleConfirmSave = () => {
    // Validate template name
    if (!templateName.trim()) {
      toast({
        title: "Template Name Required",
        description: "Please enter a name for your template.",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate names
    const isDuplicate = existingConfigurations.some(
      (config: any) => config.name.toLowerCase() === templateName.toLowerCase()
    );

    if (isDuplicate) {
      toast({
        title: "Template Name Already Exists",
        description: "A template with this name already exists. Please choose a different name.",
        variant: "destructive",
      });
      return;
    }

    // Save the template with the new name
    const configToSave = { ...orderConfig, name: templateName };
    saveTemplateMutation.mutate(configToSave);
    setShowSaveDialog(false);
    setTemplateName("");
  };

  const handleExportConfig = () => {
    const configJson = JSON.stringify(orderConfig, null, 2);
    const blob = new Blob([configJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopify-order-config.json";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Configuration Exported",
      description: "Configuration file has been downloaded.",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShoppingCart className="text-blue-600 h-8 w-8" />
              <h1 className="text-2xl font-semibold text-gray-900">
                Shopify Order Test Generator
              </h1>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                QA Tool
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <HelpCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Configuration Panel */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Order Configuration
                  </h2>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSaveTemplate}
                    disabled={saveTemplateMutation.isPending}
                  >
                    {saveTemplateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Save Template
                  </Button>
                </div>
                
                <OrderConfigurationForm
                  config={orderConfig}
                  onChange={setOrderConfig}
                />
              </CardContent>
            </Card>
          </div>

          {/* Action Panel & Preview */}
          <div className="space-y-6">
            {/* Order Preview Card */}
            <OrderPreview config={orderConfig} />

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleCreateOrders}
                disabled={isCreatingOrders || createOrdersMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-800 text-white font-medium py-3"
              >
                {isCreatingOrders || createOrdersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Create Test Orders
              </Button>
              
              <Button
                onClick={handleValidateConfig}
                disabled={validateMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {validateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Validate Configuration
              </Button>
              
              <Button
                onClick={handleExportConfig}
                variant="outline"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Configuration
              </Button>
            </div>

            {/* Progress Indicator */}
            {isCreatingOrders && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 mr-2" />
                    <span className="text-blue-800 font-medium">Creating Orders...</span>
                  </div>
                  <Progress value={creationProgress.percentage} className="mb-2" />
                  <div className="text-xs text-blue-700">
                    {creationProgress.status}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Order History Section */}
        <div className="mt-12">
          <OrderHistory batches={orderBatches} onRefresh={refetchBatches} />
        </div>
      </main>

      {/* Save Template Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
            <DialogDescription>
              Enter a name for your order configuration template. This will allow you to quickly reuse this setup for future orders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., BB Subscription - US Orders"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSaveDialog(false);
                setTemplateName("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmSave}
              disabled={saveTemplateMutation.isPending}
            >
              {saveTemplateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

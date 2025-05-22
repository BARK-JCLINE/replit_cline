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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  OrderConfiguration,
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
  const [selectedExistingTemplate, setSelectedExistingTemplate] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: number; name: string } | null>(null);

  // Fetch order batches for history
  const { data: orderBatches = [], refetch: refetchBatches } = useQuery<OrderBatch[]>({
    queryKey: ["/api/batches"],
  });

  // Fetch existing configurations for duplicate validation
  const { data: existingConfigurations = [] } = useQuery<OrderConfiguration[]>({
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
      queryClient.invalidateQueries({ queryKey: ["/api/configurations"] });
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

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, config }: { id: number; config: InsertOrderConfiguration }) => {
      const response = await apiRequest("PUT", `/api/configurations/${id}`, config);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/configurations"] });
      toast({
        title: "Template Updated!",
        description: `Template "${data.name}" has been updated successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update template. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/configurations/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/configurations"] });
      queryClient.removeQueries({ queryKey: ["/api/configurations"] });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      toast({
        title: "Template Deleted!",
        description: "Template has been deleted successfully.",
      });
    },
    onError: (error) => {
      console.error("Delete error:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete template. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create orders mutation
  const createOrdersMutation = useMutation({
    mutationFn: async (config: InsertOrderConfiguration) => {
      // Create batch with a unique temporary name for order creation
      const batchId = `BATCH-${Date.now()}`;
      
      // Create batch without saving configuration permanently
      const batchResponse = await apiRequest("POST", "/api/batches", {
        batchId,
        configurationId: null, // No permanent config needed for temporary orders
        orderCount: config.orderCount,
        status: "pending",
      });
      const batch = await batchResponse.json();

      // Start order creation directly with the configuration
      const orderResponse = await apiRequest("POST", "/api/orders/create", {
        configuration: config, // Pass config directly instead of ID
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
      // Clean the config before sending - remove empty line items
      const cleanedConfig = {
        ...orderConfig,
        lineItems: orderConfig.lineItems.filter(item => item.productId && item.productId.trim() !== "")
      };
      
      await createOrdersMutation.mutateAsync(cleanedConfig);
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
    setSelectedExistingTemplate(null);
  };

  const handleConfirmSave = () => {
    // Validate template name or selection
    if (!selectedExistingTemplate && !templateName.trim()) {
      toast({
        title: "Template Name Required",
        description: "Please enter a name for your template or select an existing one to update.",
        variant: "destructive",
      });
      return;
    }

    if (selectedExistingTemplate) {
      // Update existing template
      const existingTemplate = existingConfigurations.find(t => t.id === selectedExistingTemplate);
      const configToSave = { ...orderConfig, name: existingTemplate?.name || templateName };
      updateTemplateMutation.mutate({ id: selectedExistingTemplate, config: configToSave });
    } else {
      // Check for duplicate names when creating new template
      const isDuplicate = existingConfigurations.some(
        (config) => config.name.toLowerCase() === templateName.toLowerCase()
      );

      if (isDuplicate) {
        toast({
          title: "Template Name Already Exists",
          description: "A template with this name already exists. Please choose a different name or select it to update.",
          variant: "destructive",
        });
        return;
      }

      // Save new template
      const configToSave = { ...orderConfig, name: templateName };
      saveTemplateMutation.mutate(configToSave);
    }
    
    setShowSaveDialog(false);
    setTemplateName("");
    setSelectedExistingTemplate(null);
  };

  const handleLoadTemplate = (template: OrderConfiguration) => {
    // Create a properly formatted configuration
    const loadedConfig: InsertOrderConfiguration = {
      name: template.name,
      warehouse: template.warehouse,
      address: template.address,
      lineItems: Array.isArray(template.lineItems) ? template.lineItems : [{ productId: "", quantity: 1 }],
      subscriptionType: template.subscriptionType || "",
      customerSegment: template.customerSegment || "",
      customTags: Array.isArray(template.customTags) ? template.customTags : [],
      addressTemplate: template.addressTemplate || "",
      stateProvince: template.stateProvince || "",
      orderCount: template.orderCount || 1,
      customerFirstName: template.customerFirstName || "",
      customerLastName: template.customerLastName || "",
      customerEmail: template.customerEmail || "",
      orderDelay: template.orderDelay || 0,
    };
    
    setOrderConfig(loadedConfig);
    
    toast({
      title: "Template Loaded!",
      description: `Configuration "${template.name}" has been loaded successfully.`,
    });
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
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Load Template
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        {existingConfigurations.length === 0 ? (
                          <div className="p-2 text-sm text-gray-500">No saved templates</div>
                        ) : (
                          existingConfigurations.map((template) => (
                            <DropdownMenuItem 
                              key={template.id}
                              className="cursor-pointer flex items-center justify-between p-2"
                              asChild
                            >
                              <div>
                                <div 
                                  className="flex-1"
                                  onClick={() => handleLoadTemplate(template)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{template.name}</span>
                                    <span className="text-xs text-gray-500">
                                      ID: {template.id} • {template.warehouse} • {template.address}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTemplateToDelete({ id: template.id, name: template.name });
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  🗑️
                                </Button>
                              </div>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Template</DialogTitle>
            <DialogDescription>
              Choose whether to create a new template or update an existing one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup 
              value={selectedExistingTemplate ? "update" : "new"} 
              onValueChange={(value) => {
                if (value === "new") {
                  setSelectedExistingTemplate(null);
                } else {
                  if (existingConfigurations.length > 0) {
                    setSelectedExistingTemplate(existingConfigurations[0].id);
                  }
                }
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new">Create new template</Label>
              </div>
              {existingConfigurations.length > 0 && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update" id="update" />
                  <Label htmlFor="update">Update existing template</Label>
                </div>
              )}
            </RadioGroup>

            {!selectedExistingTemplate ? (
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
            ) : (
              <div className="space-y-2">
                <Label htmlFor="existing-template">Select Template to Update</Label>
                <select 
                  id="existing-template"
                  className="w-full p-2 border border-gray-300 rounded-md"
                  value={selectedExistingTemplate || ""}
                  onChange={(e) => setSelectedExistingTemplate(Number(e.target.value))}
                >
                  {existingConfigurations.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.warehouse} • {template.address})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSaveDialog(false);
                setTemplateName("");
                setSelectedExistingTemplate(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmSave}
              disabled={saveTemplateMutation.isPending || updateTemplateMutation.isPending}
            >
              {(saveTemplateMutation.isPending || updateTemplateMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {selectedExistingTemplate ? "Update Template" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the template "{templateToDelete?.name}"? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setTemplateToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (templateToDelete) {
                  deleteTemplateMutation.mutate(templateToDelete.id);
                }
              }}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

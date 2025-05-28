import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History, Download, Trash2, Eye, RotateCcw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { OrderBatch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface OrderHistoryProps {
  batches: OrderBatch[];
  onRefresh: () => void;
}

export function OrderHistory({ batches, onRefresh }: OrderHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBatches, setSelectedBatches] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFromShopify, setDeleteFromShopify] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<{
    isDeleting: boolean;
    current: number;
    total: number;
    message: string;
  }>({
    isDeleting: false,
    current: 0,
    total: 0,
    message: ""
  });

  // Delete batches mutation
  const deleteBatchesMutation = useMutation({
    mutationFn: async (batchesToDelete: { ids: number[], deleteFromShopify: boolean }) => {
      let succeeded = 0;
      let failed = 0;
      const total = batchesToDelete.ids.length;

      // Start progress tracking
      setDeletionProgress({
        isDeleting: true,
        current: 0,
        total: total,
        message: `Starting deletion of ${total} order batch${total !== 1 ? 'es' : ''}...`
      });

      for (let i = 0; i < batchesToDelete.ids.length; i++) {
        const id = batchesToDelete.ids[i];
        
        // Update progress
        setDeletionProgress(prev => ({
          ...prev,
          current: i,
          message: `Deleting batch ${i + 1} of ${total}...`
        }));

        try {
          const response = await fetch(`/api/batches/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteFromShopify: batchesToDelete.deleteFromShopify })
          });

          if (response.ok) {
            succeeded++;
          } else {
            failed++;
            console.error(`Failed to delete batch ${id}: ${response.status}`);
          }
        } catch (error) {
          failed++;
          console.error(`Error deleting batch ${id}:`, error);
        }

        // Add delay between deletions when deleting from Shopify to avoid rate limits
        if (batchesToDelete.deleteFromShopify && i < batchesToDelete.ids.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      // Complete progress
      setDeletionProgress(prev => ({
        ...prev,
        current: total,
        message: `Deletion complete: ${succeeded} succeeded, ${failed} failed`
      }));

      return { succeeded, failed, total };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setSelectedBatches([]);
      onRefresh();

      // Clear progress after a delay to show completion
      setTimeout(() => {
        setDeletionProgress({
          isDeleting: false,
          current: 0,
          total: 0,
          message: ""
        });
      }, 2000);

      // Show final result
      if (data.failed > 0) {
        toast({
          title: "Deletion Completed with Errors",
          description: `${data.succeeded} deleted successfully, ${data.failed} failed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Orders Deleted!",
          description: `All ${data.succeeded} order batch${data.succeeded !== 1 ? 'es' : ''} deleted successfully.`,
        });
      }
    },
    onError: (error) => {
      console.error("Bulk deletion error:", error);
      setDeletionProgress({
        isDeleting: false,
        current: 0,
        total: 0,
        message: ""
      });
      toast({
        title: "Delete Failed",
        description: "Failed to delete selected orders. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleExportHistory = () => {
    const historyJson = JSON.stringify(batches, null, 2);
    const blob = new Blob([historyJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "order-history.json";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "History Exported",
      description: "Order history has been downloaded.",
    });
  };

  const handleSelectAll = () => {
    if (selectedBatches.length === batches.length) {
      setSelectedBatches([]);
    } else {
      setSelectedBatches(batches.map(batch => batch.id));
    }
  };

  const handleBatchSelect = (batchId: number) => {
    setSelectedBatches(prev => 
      prev.includes(batchId) 
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedBatches.length === 0) return;
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    // Close dialog immediately to allow continued interaction
    setDeleteDialogOpen(false);
    setDeleteFromShopify(false);

    // Start deletion process
    deleteBatchesMutation.mutate({ 
      ids: selectedBatches, 
      deleteFromShopify 
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "partial":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "processing":
        return <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      default:
        return <div className="h-4 w-4 bg-gray-400 rounded-full" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" } = {
      completed: "default",
      partial: "secondary",
      failed: "destructive",
      processing: "secondary",
      pending: "secondary",
    };

    const colors: { [key: string]: string } = {
      partial: "bg-yellow-100 text-yellow-800 border-yellow-200",
    };

    return (
      <Badge 
        variant={variants[status] || "secondary"} 
        className={`capitalize ${colors[status] || ""}`}
      >
        {status}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: Date | string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <History className="text-blue-600 mr-2 h-5 w-5" />
            Order Creation History
            {selectedBatches.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedBatches.length} selected
              </Badge>
            )}
          </h2>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportHistory}
              disabled={batches.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={selectedBatches.length === 0}
              className="text-red-600 hover:text-red-700 disabled:text-gray-400"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear ({selectedBatches.length})
            </Button>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No order batches created yet.</p>
            <p className="text-sm">Start by creating your first batch of test orders above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {batches.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <Checkbox
                  checked={selectedBatches.length === batches.length}
                  onCheckedChange={() => handleSelectAll()}
                />
                <span className="text-sm text-gray-600">
                  Select All ({batches.length} orders)
                </span>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead className="font-medium text-gray-700">Timestamp</TableHead>
                  <TableHead className="font-medium text-gray-700">Shopify Order Name</TableHead>
                  <TableHead className="font-medium text-gray-700">Shopify ID</TableHead>
                  <TableHead className="font-medium text-gray-700">Orders Created</TableHead>
                  <TableHead className="font-medium text-gray-700">Status</TableHead>
                  <TableHead className="font-medium text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const createdOrders = Array.isArray(batch.createdOrders) ? batch.createdOrders : [];
                  const validOrders = createdOrders.filter((order: any) => !order.error);
                  const lastOrder = validOrders[validOrders.length - 1]; // Get the last created order
                  const firstOrderName = validOrders[0]?.shopify_order_number || validOrders[0]?.name;

                  return (
                    <TableRow key={batch.id} className="hover:bg-gray-50">
                      <TableCell>
                        <Checkbox
                          checked={selectedBatches.includes(batch.id)}
                          onCheckedChange={() => handleBatchSelect(batch.id)}
                        />
                      </TableCell>
                      <TableCell className="text-gray-900">
                        {formatTimestamp(batch.createdAt)}
                      </TableCell>
                      <TableCell>
                        {firstOrderName ? (
                          <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                            BARK-{firstOrderName}
                          </code>
                        ) : (
                          <span className="text-gray-500 text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {lastOrder?.id ? (
                          <code className="bg-blue-50 px-2 py-1 rounded text-xs font-mono text-blue-700">
                            {lastOrder.id}
                          </code>
                        ) : (
                          <span className="text-gray-500 text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {batch.status === 'failed' && batch.errorMessage === 'Cancelled by user' ? (
                          <span>
                            <span className="text-green-600">{validOrders.length}</span>
                            <span className="text-gray-500">/{batch.orderCount}</span>
                          </span>
                        ) : (
                          <>
                            {validOrders.length}
                            {batch.orderCount > 1 && (
                              <span className="text-xs text-gray-500 ml-1">
                                of {batch.orderCount}
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(batch.status)}
                          {getStatusBadge(batch.status)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {lastOrder?.id ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                // Open Shopify order in new tab
                                const orderUrl = `https://admin.shopify.com/store/dev-bark-co/orders/${lastOrder.id}`;
                                window.open(orderUrl, '_blank');
                              }}
                              title="View order in Shopify"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Deletion Progress Bar */}
        {deletionProgress.isDeleting && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">
                {deletionProgress.message}
              </span>
              <span className="text-sm text-blue-700">
                {deletionProgress.current}/{deletionProgress.total}
              </span>
            </div>
            <Progress 
              value={(deletionProgress.current / deletionProgress.total) * 100} 
              className="w-full"
            />
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Orders</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedBatches.length} selected order{selectedBatches.length !== 1 ? 's' : ''}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="deleteFromShopify"
                checked={deleteFromShopify}
                onCheckedChange={(checked) => setDeleteFromShopify(checked === true)}
              />
              <label
                htmlFor="deleteFromShopify"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Also delete orders from Shopify store
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {deleteFromShopify 
                ? "⚠️ This will permanently remove the orders from your Shopify store and cannot be undone."
                : "Orders will only be removed from this tool's history, but will remain in your Shopify store."
              }
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteFromShopify(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteBatchesMutation.isPending}
            >
              Delete Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, Download, Trash2, Eye, RotateCcw, CheckCircle, XCircle } from "lucide-react";
import type { OrderBatch } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface OrderHistoryProps {
  batches: OrderBatch[];
  onRefresh: () => void;
}

export function OrderHistory({ batches, onRefresh }: OrderHistoryProps) {
  const { toast } = useToast();

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

  const handleClearHistory = () => {
    // In a real app, this would call an API to clear history
    toast({
      title: "Clear History",
      description: "This would clear all order history (not implemented in demo).",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
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
      failed: "destructive",
      processing: "secondary",
      pending: "secondary",
    };

    return (
      <Badge variant={variants[status] || "secondary"} className="capitalize">
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
              onClick={handleClearHistory}
              disabled={batches.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
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
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-medium text-gray-700">Timestamp</TableHead>
                  <TableHead className="font-medium text-gray-700">Shopify Order Name</TableHead>
                  <TableHead className="font-medium text-gray-700">Shopify ID</TableHead>
                  <TableHead className="font-medium text-gray-700">Orders Created</TableHead>
                  <TableHead className="font-medium text-gray-700">Configuration</TableHead>
                  <TableHead className="font-medium text-gray-700">Status</TableHead>
                  <TableHead className="font-medium text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const createdOrders = Array.isArray(batch.createdOrders) ? batch.createdOrders : [];
                  const firstOrder = createdOrders[0];
                  
                  return (
                    <TableRow key={batch.id} className="hover:bg-gray-50">
                      <TableCell className="text-gray-900">
                        {formatTimestamp(batch.createdAt)}
                      </TableCell>
                      <TableCell>
                        {firstOrder?.name ? (
                          <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                            {firstOrder.name}
                          </code>
                        ) : (
                          <span className="text-gray-500 text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {firstOrder?.id ? (
                          <code className="bg-blue-50 px-2 py-1 rounded text-xs font-mono text-blue-700">
                            {firstOrder.id}
                          </code>
                        ) : (
                          <span className="text-gray-500 text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {batch.orderCount}
                        {createdOrders.length > 1 && (
                          <span className="text-xs text-gray-500 ml-1">
                            (+{createdOrders.length - 1} more)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                            {batch.configurationId ? `Config-${batch.configurationId}` : "N/A"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(batch.status)}
                          {getStatusBadge(batch.status)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
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
      </CardContent>
    </Card>
  );
}

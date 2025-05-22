import { Card, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";
import type { InsertOrderConfiguration } from "@shared/schema";
import {
  WAREHOUSE_OPTIONS,
  ADDRESS_OPTIONS,
  SUBSCRIPTION_TYPE_OPTIONS,
} from "@/lib/types";

interface OrderPreviewProps {
  config: InsertOrderConfiguration;
}

export function OrderPreview({ config }: OrderPreviewProps) {
  const getOptionLabel = (options: { value: string; label: string }[], value: string) => {
    return options.find(option => option.value === value)?.label || "Not selected";
  };

  const lineItemCount = config.lineItems.filter(item => item.productId).length;

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Eye className="text-blue-600 mr-2 h-5 w-5" />
          Order Preview
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Warehouse:</span>
            <span className="font-medium">
              {getOptionLabel(WAREHOUSE_OPTIONS, config.warehouse)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Address:</span>
            <span className="font-medium">
              {getOptionLabel(ADDRESS_OPTIONS, config.address)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Line Items:</span>
            <span className="font-medium">
              {lineItemCount} product{lineItemCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Sub Type:</span>
            <span className="font-medium">
              {getOptionLabel(SUBSCRIPTION_TYPE_OPTIONS, config.subscriptionType || "")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Orders to Create:</span>
            <span className="font-semibold text-blue-600">
              {config.orderCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

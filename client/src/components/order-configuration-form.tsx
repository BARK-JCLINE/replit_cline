import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertOrderConfigurationSchema, type InsertOrderConfiguration, type LineItem } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Warehouse, Box, Tags, MapPin, Copy, Plus, Trash2, User } from "lucide-react";
import {
  WAREHOUSE_OPTIONS,
  ADDRESS_OPTIONS,
  PRODUCT_OPTIONS,
  ORDER_TYPE_OPTIONS,
  ORDER_DELAY_OPTIONS,
  SKU_TEMPLATE_OPTIONS,
} from "@/lib/types";

interface OrderConfigurationFormProps {
  config: InsertOrderConfiguration;
  onChange: (config: InsertOrderConfiguration) => void;
}

export function OrderConfigurationForm({ config, onChange }: OrderConfigurationFormProps) {
  const form = useForm<InsertOrderConfiguration>({
    resolver: zodResolver(insertOrderConfigurationSchema),
    defaultValues: config,
    mode: "onChange",
  });

  // Reset form when config changes (for template loading)
  useEffect(() => {
    form.reset(config);
  }, [config, form]);

  const handleFormChange = (data: InsertOrderConfiguration) => {
    onChange(data);
  };

  const addLineItem = () => {
    const newLineItems = [...config.lineItems, { productId: "", quantity: 1 }];
    const newConfig = { ...config, lineItems: newLineItems };
    form.setValue("lineItems", newLineItems);
    onChange(newConfig);
  };

  const removeLineItem = (index: number) => {
    const newLineItems = config.lineItems.filter((_, i) => i !== index);
    const newConfig = { ...config, lineItems: newLineItems };
    form.setValue("lineItems", newLineItems);
    onChange(newConfig);
  };

  const updateLineItem = (index: number, updates: Partial<LineItem>) => {
    const newLineItems = [...config.lineItems];
    newLineItems[index] = { ...newLineItems[index], ...updates };
    const newConfig = { ...config, lineItems: newLineItems };
    form.setValue("lineItems", newLineItems);
    onChange(newConfig);
  };

  return (
    <Form {...form}>
      <form onChange={() => handleFormChange(form.getValues())} className="space-y-8">
        {/* Customer Details Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <User className="text-blue-600 mr-2 h-5 w-5" />
            Customer Details
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="customerFirstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="customerLastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <FormField
            control={form.control}
            name="customerEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input placeholder="john.doe@example.com" type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Warehouse & Location Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Warehouse className="text-blue-600 mr-2 h-5 w-5" />
            Warehouse & Location
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="warehouse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Warehouse Location</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {WAREHOUSE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select address..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ADDRESS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Line Items Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Box className="text-blue-600 mr-2 h-5 w-5" />
            Line Items Configuration
          </h3>
          
          {/* SKU Template Helper */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-3">Quick SKU Templates</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {SKU_TEMPLATE_OPTIONS.map((template) => (
                  <Button
                    key={template.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (config.lineItems.length === 1 && !config.lineItems[0].productId) {
                        updateLineItem(0, { productId: template.sku || template.value });
                      } else {
                        const newLineItems = [...config.lineItems, { productId: template.sku || template.value, quantity: 1 }];
                        const newConfig = { ...config, lineItems: newLineItems };
                        form.setValue("lineItems", newLineItems);
                        onChange(newConfig);
                      }
                    }}
                    className="text-xs bg-white hover:bg-blue-100 border-blue-300"
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="space-y-4">
                {config.lineItems.map((item, index) => (
                  <div key={index} className="flex items-center space-x-4">
                    <div className="flex-1">
                      <Input
                        value={item.productId}
                        onChange={(e) => updateLineItem(index, { productId: e.target.value })}
                        placeholder="Enter SKU or product ID..."
                        className="font-mono"
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, { quantity: parseInt(e.target.value) || 1 })}
                        className="text-center"
                        placeholder="Qty"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLineItem(index)}
                      disabled={config.lineItems.length === 1}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addLineItem}
                  className="w-full border-dashed border-2 border-gray-300 hover:border-blue-600 hover:text-blue-600"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Tags Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Tags className="text-blue-600 mr-2 h-5 w-5" />
            Tags
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="subscriptionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Type</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    
                    // Auto-add appropriate tags based on order type
                    let newTags = [...(config.customTags || [])];
                    
                    // Remove existing auto-tags first
                    newTags = newTags.filter(tag => 
                      tag !== "Ordergroove Trigger Order" && 
                      tag !== "Ordergroove Subscription Order" && 
                      tag !== "contains_kibble"
                    );
                    
                    // Add appropriate tag based on selection
                    if (value === "first-subscription") {
                      newTags.push("Ordergroove Trigger Order");
                    } else if (value === "continuity-subscription") {
                      newTags.push("Ordergroove Subscription Order");
                    } else if (value === "kibble") {
                      newTags.push("contains_kibble");
                    }
                    
                    // Update the config with new tags
                    const newConfig = { ...config, customTags: newTags };
                    form.setValue("customTags", newTags);
                    onChange(newConfig);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select order type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ORDER_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {/* Additional Tags Section */}
          <div>
            <FormLabel>Additional Tags</FormLabel>
            <Card className="bg-gray-50 mt-2">
              <CardContent className="p-4">
                <div className="space-y-4">
                  {(config.customTags || []).map((tag, index) => (
                    <div key={index} className="flex items-center space-x-4">
                      <div className="flex-1">
                        <Input
                          value={tag}
                          onChange={(e) => {
                            const newTags = [...(config.customTags || [])];
                            newTags[index] = e.target.value;
                            const newConfig = { ...config, customTags: newTags };
                            form.setValue("customTags", newTags);
                            onChange(newConfig);
                          }}
                          placeholder="Enter custom tag..."
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newTags = (config.customTags || []).filter((_, i) => i !== index);
                          const newConfig = { ...config, customTags: newTags };
                          form.setValue("customTags", newTags);
                          onChange(newConfig);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newTags = [...(config.customTags || []), ""];
                      const newConfig = { ...config, customTags: newTags };
                      form.setValue("customTags", newTags);
                      onChange(newConfig);
                    }}
                    className="w-full border-dashed border-2 border-gray-300 hover:border-blue-600 hover:text-blue-600"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Tag
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />



        {/* Bulk Generation Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Copy className="text-blue-600 mr-2 h-5 w-5" />
            Bulk Generation
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="orderCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Orders</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            

            
            <FormField
              control={form.control}
              name="orderDelay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay Between Orders</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value) || 0)} defaultValue={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select delay..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ORDER_DELAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </form>
    </Form>
  );
}

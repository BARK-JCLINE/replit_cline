# Order Generator Application

## Overview

This is a full-stack web application designed for generating and managing test orders. The application provides a user-friendly interface for creating order configurations with various parameters like warehouses, shipping regions, line items, and customer segments, then generating multiple orders based on those configurations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and dark mode support
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for RESTful API
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon serverless)
- **Development**: tsx for TypeScript execution in development
- **Build**: esbuild for fast production builds

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Fallback Storage**: In-memory storage implementation for development/testing

## Key Components

### Database Schema
The application uses two main tables:
1. **order_configurations**: Stores order templates with parameters like warehouse, shipping region, line items, subscription type, customer segment, and order generation settings
2. **order_batches**: Tracks batch order generation jobs with status, progress, and results

### API Structure
RESTful endpoints for:
- **Configuration Management**: CRUD operations for order configurations
- **Batch Processing**: Creating and monitoring order generation batches
- **Real-time Updates**: Progress tracking for long-running order generation processes

### UI Components
- **Order Configuration Form**: Multi-step form with validation for creating order templates
- **Order Preview**: Real-time preview of order configuration
- **Order History**: Table view of generated order batches with status tracking
- **Progress Indicators**: Real-time progress bars for batch operations

## Data Flow

1. **Configuration Creation**: Users create order configurations through the form interface
2. **Validation**: Client-side validation using Zod schemas shared between frontend and backend
3. **Storage**: Configurations are stored in PostgreSQL via Drizzle ORM
4. **Batch Generation**: Users initiate order generation which creates batch records
5. **Progress Tracking**: Real-time updates on batch generation progress
6. **History Management**: Completed batches are stored with results and can be exported

## External Dependencies

### UI and Styling
- **Radix UI**: Comprehensive set of accessible UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Touch-friendly carousel component

### Development and Validation
- **Zod**: Schema validation shared between client and server
- **React Hook Form**: Form state management with validation
- **TanStack Query**: Server state management and caching

### Database and Backend
- **Neon Database**: Serverless PostgreSQL provider
- **Drizzle ORM**: Type-safe database toolkit
- **Express.js**: Web application framework

## Deployment Strategy

### Development
- **Dev Server**: Vite development server with HMR for frontend
- **API Server**: Express server running via tsx for TypeScript support
- **Database**: Local PostgreSQL or Neon serverless instance
- **Port Configuration**: Frontend on port 5000 with API proxy

### Production
- **Build Process**: 
  - Frontend: Vite builds optimized static assets
  - Backend: esbuild creates bundled server application
- **Deployment Target**: Replit autoscale deployment
- **Static Assets**: Served by Express server from dist/public
- **Environment**: NODE_ENV-based configuration switching

### Database Management
- **Migrations**: Drizzle Kit handles schema migrations
- **Connection**: Environment-based DATABASE_URL configuration
- **Development Fallback**: In-memory storage for cases where database is unavailable

The architecture emphasizes type safety throughout the stack with shared schemas, modern development practices with fast build tools, and a component-based UI that's both accessible and responsive.
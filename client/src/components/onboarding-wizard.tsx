import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowRight, ArrowLeft, X, Users, FileText, CreditCard, BarChart3, MessageSquare, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hasAtLeastRole, Role } from '@/lib/roles';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  actionText?: string;
  actionHref?: string;
}

interface OnboardingWizardProps {
  userRole: Role;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingWizard({ userRole, isOpen, onClose, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const getStepsForRole = (role: Role | undefined): OnboardingStep[] => {
    const commonSteps = [
      {
        id: 'welcome',
        title: 'Welcome to MyPremierPlans',
        description: 'Get started with your healthcare enrollment platform',
        icon: <CheckCircle className="h-8 w-8 text-green-500" />,
        content: (
          <div className="space-y-4">
            <p className="text-gray-600">
              Welcome to MyPremierPlans! This quick tour will help you understand the key features and get you started.
            </p>
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900">What you'll learn:</h4>
              <ul className="list-disc list-inside text-blue-800 mt-2 space-y-1">
                <li>How to navigate the platform</li>
                <li>Key features for your role</li>
                <li>How to get help when needed</li>
              </ul>
            </div>
          </div>
        )
      }
    ];

    if (hasAtLeastRole(role, 'admin')) {
      return [
        ...commonSteps,
        {
          id: 'dashboard',
          title: 'Admin Dashboard Overview',
          description: 'Monitor platform performance and manage users',
          icon: <BarChart3 className="h-8 w-8 text-blue-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Your admin dashboard provides a comprehensive view of platform activity and key metrics.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Key Metrics</h4>
                  <p className="text-sm text-gray-600">Track enrollments, revenue, and user activity</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="font-semibold text-gray-900">User Management</h4>
                  <p className="text-sm text-gray-600">Approve new users and manage roles</p>
                </div>
              </div>
            </div>
          ),
          actionText: 'View Dashboard',
          actionHref: '/admin'
        },
        {
          id: 'user-approval',
          title: 'User Approval System',
          description: 'Review and approve new user registrations',
          icon: <Users className="h-8 w-8 text-orange-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                New users require approval before accessing the platform. This helps maintain security and prevents unauthorized access.
              </p>
              <div className="bg-orange-50 p-4 rounded-lg">
                <h4 className="font-semibold text-orange-900">Approval Process</h4>
                <ol className="list-decimal list-inside text-orange-800 mt-2 space-y-1">
                  <li>Review pending user information</li>
                  <li>Check for suspicious activity indicators</li>
                  <li>Approve or reject with reason</li>
                </ol>
              </div>
            </div>
          ),
          actionText: 'Manage Users',
          actionHref: '/admin'
        },
        {
          id: 'enrollment-tracking',
          title: 'Enrollment Management',
          description: 'Monitor and manage member enrollments',
          icon: <FileText className="h-8 w-8 text-green-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Track all member enrollments, view detailed information, and export data for reporting.
              </p>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-900">Features</h4>
                <ul className="list-disc list-inside text-green-800 mt-2 space-y-1">
                  <li>Real-time enrollment tracking</li>
                  <li>Detailed member profiles</li>
                  <li>Export capabilities for reporting</li>
                  <li>Commission tracking per agent</li>
                </ul>
              </div>
            </div>
          )
        }
      ];
    }

    if (hasAtLeastRole(role, 'agent')) {
      return [
        ...commonSteps,
        {
          id: 'agent-dashboard',
          title: 'Agent Dashboard',
          description: 'Track your enrollments and commission earnings',
          icon: <BarChart3 className="h-8 w-8 text-blue-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Your dashboard shows your performance metrics, recent enrollments, and earnings.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h4 className="font-semibold text-blue-900">Commission Tracking</h4>
                  <p className="text-sm text-blue-800">Monitor your earnings by plan type</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <h4 className="font-semibold text-blue-900">Enrollment Stats</h4>
                  <p className="text-sm text-blue-800">Track monthly and total enrollments</p>
                </div>
              </div>
            </div>
          ),
          actionText: 'View Dashboard',
          actionHref: '/agent'
        },
        {
          id: 'enrollment-process',
          title: 'Member Enrollment',
          description: 'Learn how to enroll new members',
          icon: <Users className="h-8 w-8 text-green-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Guide new members through the enrollment process step by step.
              </p>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-900">Enrollment Steps</h4>
                <ol className="list-decimal list-inside text-green-800 mt-2 space-y-1">
                  <li>Collect personal information</li>
                  <li>Select appropriate healthcare membership and coverage</li>
                  <li>Add family members if needed</li>
                  <li>Process payment</li>
                  <li>Complete enrollment confirmation</li>
                </ol>
              </div>
            </div>
          ),
          actionText: 'Start Enrollment',
          actionHref: '/enrollment'
        },
        {
          id: 'lead-management',
          title: 'Lead Management',
          description: 'Track and follow up with potential members',
          icon: <MessageSquare className="h-8 w-8 text-purple-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Manage your leads from initial contact through enrollment completion.
              </p>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="font-semibold text-purple-900">Lead Workflow</h4>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Badge variant="outline" className="text-purple-800">New</Badge>
                  <Badge variant="outline" className="text-purple-800">Contacted</Badge>
                  <Badge variant="outline" className="text-purple-800">Qualified</Badge>
                  <Badge variant="outline" className="text-purple-800">Enrolled</Badge>
                </div>
              </div>
            </div>
          ),
          actionText: 'Manage Leads',
          actionHref: '/agent/leads'
        },
        {
          id: 'commission-structure',
          title: 'Commission Structure',
          description: 'Understand how you earn commissions',
          icon: <CreditCard className="h-8 w-8 text-yellow-500" />,
          content: (
            <div className="space-y-4">
              <p className="text-gray-600">
                Your commission varies by plan type and includes bonuses for add-ons.
              </p>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-semibold text-yellow-900">Commission Rates</h4>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-yellow-800">
                    <span>Base Plans:</span>
                    <span className="font-semibold">$9-17</span>
                  </div>
                  <div className="flex justify-between text-yellow-800">
                    <span>Plus/Elite Plans:</span>
                    <span className="font-semibold">$20-40</span>
                  </div>
                  <div className="flex justify-between text-yellow-800">
                    <span>RxValet Add-on:</span>
                    <span className="font-semibold">+$2.50</span>
                  </div>
                </div>
              </div>
            </div>
          )
        }
      ];
    }

    // Regular user steps
    return [
      ...commonSteps,
      {
        id: 'member-benefits',
        title: 'Your Member Benefits',
        description: 'Understand your healthcare membership features',
        icon: <Calendar className="h-8 w-8 text-green-500" />,
        content: (
          <div className="space-y-4">
            <p className="text-gray-600">
              As a member, you have access to comprehensive healthcare services through your DPC plan.
            </p>
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900">Key Benefits</h4>
              <ul className="list-disc list-inside text-green-800 mt-2 space-y-1">
                <li>Unlimited virtual/telehealth visits</li>
                <li>Direct access to your primary care provider</li>
                <li>24/7 Patient Advocate Line (PAL)</li>
                <li>Mobile app for convenient access</li>
                <li>Prescription management</li>
              </ul>
            </div>
          </div>
        )
      },
      {
        id: 'contact-support',
        title: 'Getting Help',
        description: 'Know how to reach support when needed',
        icon: <MessageSquare className="h-8 w-8 text-blue-500" />,
        content: (
          <div className="space-y-4">
            <p className="text-gray-600">
              We're here to help! Contact our support team anytime you need assistance.
            </p>
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900">Support Options</h4>
              <div className="space-y-2 mt-2 text-blue-800">
                <div>📞 <strong>Phone:</strong> Available 24/7</div>
                <div>📧 <strong>Email:</strong> info@mypremierplans.com</div>
                <div>💬 <strong>Mobile App:</strong> In-app messaging</div>
              </div>
            </div>
          </div>
        )
      }
    ];
  };

  const steps = getStepsForRole(userRole);
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCompletedSteps(prev => new Set([...prev, steps[currentStep].id]));
      setCurrentStep(currentStep + 1);
    } else {
      setCompletedSteps(prev => new Set([...prev, steps[currentStep].id]));
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">Platform Tour</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        </DialogHeader>

        <Card className="border-0 shadow-none">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4">
              {currentStepData.icon}
            </div>
            <CardTitle className="text-2xl">{currentStepData.title}</CardTitle>
            <CardDescription className="text-base">
              {currentStepData.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {currentStepData.content}
            
            {currentStepData.actionText && currentStepData.actionHref && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Ready to try it?</span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={currentStepData.actionHref} target="_blank" rel="noopener noreferrer">
                      {currentStepData.actionText}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex items-center justify-between pt-6">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button variant="ghost" onClick={handleSkip}>
                Skip Tour
              </Button>
            </div>

            <Button onClick={handleNext}>
              {isLastStep ? 'Complete Tour' : 'Next'}
              {!isLastStep && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
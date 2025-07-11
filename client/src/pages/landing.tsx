import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Heart, DollarSign, Clock, UserCheck, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ContactFormModal } from "@/components/contact-form-modal";
import type { Plan } from "@shared/schema";
import heroImage from "@assets/enrollment dr image_1752013719087.jpg";

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const benefits = [
    {
      icon: DollarSign,
      title: "Transparent Pricing",
      description: "No hidden fees, no surprise bills. One low monthly membership covers all your primary care needs.",
    },
    {
      icon: Clock,
      title: "24/7 Access",
      description: "Use the Patient advocate line (PAL) or the mobile app to access care when you need it. Same-day or next day appointments available when you need care.",
    },
    {
      icon: UserCheck,
      title: "Personal Care",
      description: "Build a real relationship with your doctor. Longer appointments, personalized attention.",
    },
  ];

  const getPlanBadge = (planName: string) => {
    if (planName.toLowerCase().includes("family")) {
      return (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="medical-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      );
    }
    return null;
  };

  const getPlanFeatures = (planName: string) => {
    const baseFeatues = [
      "Unlimited office visits",
      "24/7 text & phone access",
      "Basic lab work included",
      "Prescription coordination",
    ];

    if (planName.toLowerCase().includes("family")) {
      return [
        "Coverage for up to 4 members",
        "All Individual plan benefits",
        "Pediatric care included",
        "Family health planning",
      ];
    }

    if (planName.toLowerCase().includes("group")) {
      return [
        "Minimum 10 employees",
        "Employer dashboard",
        "Wellness programs",
        "Dedicated account manager",
      ];
    }

    return baseFeatues;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Heart className="text-medical-blue-600 h-8 w-8 mr-3" />
                <span className="text-xl font-bold text-gray-900">MyPremierPlans</span>
              </div>
              <div className="hidden md:block ml-10">
                <div className="flex items-baseline space-x-4">
                  <a href="#home" className="text-medical-blue-600 px-3 py-2 text-sm font-medium">Home</a>
                  <a href="#plans" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Plans</a>
                  <a href="#about" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">About DPC</a>
                  <a href="https://www.mypremierplans.com/contactus" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium">Contact Us</a>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-gray-600">
                    Welcome, {user?.firstName || user?.email}
                  </span>
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.href = "/api/logout"}
                  >
                    Log Out
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="ghost" 
                    onClick={() => window.location.href = "/api/login"}
                  >
                    Sign In
                  </Button>
                  <Button 
                    className="medical-blue-600 hover:medical-blue-700 text-white"
                    onClick={() => setIsContactModalOpen(true)}
                  >
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-6">
                Direct Primary Care
                <span className="text-medical-blue-600"> Made Simple</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Affordable, transparent healthcare without the hassle of insurance. 
                Get unlimited access to your primary care physician for one low monthly fee.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {isAuthenticated ? (
                  user?.role === "agent" || user?.role === "admin" ? (
                    <Link href="/registration">
                      <Button size="lg" className="medical-blue-600 hover:medical-blue-700 text-white px-8 py-4">
                        Enroll New Member
                      </Button>
                    </Link>
                  ) : (
                    <div className="text-gray-600">
                      <p>Please contact your agent to make enrollment changes.</p>
                      <p className="font-semibold mt-2">210-512-4318</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      size="lg" 
                      className="medical-blue-600 hover:medical-blue-700 text-white px-8 py-4"
                      onClick={() => setLocation('/quiz')}
                    >
                      Find My Perfect Plan
                    </Button>
                    <Button 
                      variant="outline"
                      size="lg" 
                      className="px-8 py-4"
                      onClick={() => setIsContactModalOpen(true)}
                    >
                      Contact an Agent
                    </Button>
                  </div>
                )}
                <a href="https://mypremierplans.com" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="lg" className="px-8 py-4">
                    Learn More
                  </Button>
                </a>
              </div>
            </div>
            <div className="lg:pl-8">
              <img 
                src={heroImage} 
                alt="Doctor consultation with patient" 
                className="rounded-xl shadow-lg w-full h-auto object-cover"
                style={{ maxHeight: "600px" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose Direct Primary Care?</h2>
            <div className="max-w-3xl mx-auto">
              <p className="text-xl font-semibold text-gray-900 mb-2">Your Health, Your Plan</p>
              <p className="text-lg text-gray-600">
                Unlimited primary care. No copays. No insurance hassles.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center p-6">
                <div className="w-16 h-16 medical-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="text-medical-blue-600 h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plans Section */}
      <div id="plans" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Plan</h2>
            <p className="text-lg text-gray-600">Flexible membership options for individuals and families</p>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {plans?.map((plan) => (
                <Card key={plan.id} className={`relative p-8 hover:shadow-md transition-shadow ${
                  plan.name.toLowerCase().includes("family") ? "border-2 border-blue-600" : ""
                }`}>
                  {getPlanBadge(plan.name)}
                  <CardContent className="p-0">
                    <div className="text-center mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                      <div className="text-4xl font-bold text-medical-blue-600 mb-1">
                        ${plan.price}
                      </div>
                      <div className="text-gray-500">per month</div>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {getPlanFeatures(plan.name).map((feature, index) => (
                        <li key={index} className="flex items-center">
                          <Check className="text-green-500 h-5 w-5 mr-3" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {isAuthenticated ? (
                      user?.role === "agent" || user?.role === "admin" ? (
                        <Link href="/registration">
                          <Button 
                            className={`w-full ${
                              plan.name.toLowerCase().includes("group") 
                                ? "bg-white hover:bg-gray-50 text-medical-blue-600 border border-blue-600" 
                                : "medical-blue-600 hover:medical-blue-700 text-white"
                            }`}
                          >
                            {plan.name.toLowerCase().includes("group") ? "Contact Sales" : "Select Plan"}
                          </Button>
                        </Link>
                      ) : (
                        <div className="text-center text-gray-600 py-3">
                          <p className="text-sm">Contact your agent to enroll</p>
                          <p className="font-semibold">210-512-4318</p>
                        </div>
                      )
                    ) : (
                      <Button 
                        className={`w-full ${
                          plan.name.toLowerCase().includes("group") 
                            ? "bg-white hover:bg-gray-50 text-medical-blue-600 border border-blue-600" 
                            : "medical-blue-600 hover:medical-blue-700 text-white"
                        }`}
                        onClick={() => setIsContactModalOpen(true)}
                      >
                        {plan.name.toLowerCase().includes("group") ? "Contact Sales" : "Select Plan"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Contact Form Modal */}
      <ContactFormModal 
        isOpen={isContactModalOpen} 
        onClose={() => setIsContactModalOpen(false)} 
      />
    </div>
  );
}

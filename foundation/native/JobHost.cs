// Own one native server and its inherited process tree. This is a lifetime
// boundary, not a replacement for the Codex sandbox or an adversarial sandbox.
// Start suspended, assign before execution, prohibit breakaway, retain handles,
// and acknowledge cleanup only after job accounting reaches zero.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

internal static class JobHost {
    [StructLayout(LayoutKind.Sequential)] struct Security { public int Size; public IntPtr Descriptor; public int Inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public int Size; public string Reserved, Desktop, Title;
        public int X,Y,Width,Height,CharsX,CharsY,Fill,Flags; public short Show,ReservedSize;
        public IntPtr ReservedData,Input,Output,Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Info; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process,Thread; public uint Pid,Tid; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime,JobTime; public uint Flags; public UIntPtr MinWorking,MaxWorking;
        public uint ActiveLimit; public UIntPtr Affinity; public uint Priority,Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime,KernelTime,PeriodUser,PeriodKernel;
        public uint PageFaults,TotalProcesses,ActiveProcesses,TerminatedProcesses;
    }
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr security,IntPtr name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimits data,int size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting data,int size,IntPtr returned);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref Security security,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateFileW(string path,uint access,uint share,ref Security security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref StartupEx startup,out ProcessInfo process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool success) { if(!success) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    static void Close(ref IntPtr handle) { if(handle!=IntPtr.Zero&&handle!=new IntPtr(-1))CloseHandle(handle);handle=IntPtr.Zero; }
    // Windows CommandLineToArgv / CRT quoting, including empty and trailing slash.
    static string Quote(string value) {
        var output=new StringBuilder("\"");int slashes=0;
        foreach(char c in value) {
            if(c=='\\'){slashes++;continue;}
            output.Append('\\',c=='"'?slashes*2+1:slashes);output.Append(c);slashes=0;
        }
        return output.Append('\\',slashes*2).Append('"').ToString();
    }
    static Thread Copy(Stream source,Stream destination,Action ended) {
        var thread=new Thread(delegate(){try{var buffer=new byte[8192];int count;while((count=source.Read(buffer,0,buffer.Length))>0){destination.Write(buffer,0,count);destination.Flush();}}catch(IOException){}finally{if(ended!=null)ended();}});
        thread.IsBackground=true;thread.Start();return thread;
    }
    static int Main(string[] args) {
        Console.Error.NewLine="\n";
        if(args.Length==0||!Path.IsPathRooted(args[0]))return 2;
        IntPtr job=IntPtr.Zero,inputRead=IntPtr.Zero,inputWrite=IntPtr.Zero,outputRead=IntPtr.Zero,outputWrite=IntPtr.Zero,nul=IntPtr.Zero,attributes=IntPtr.Zero,handles=IntPtr.Zero;
        ProcessInfo process=new ProcessInfo();bool assigned=false,attributesReady=false;
        try {
            job=CreateJobObjectW(IntPtr.Zero,IntPtr.Zero);Check(job!=IntPtr.Zero);
            var limits=new ExtendedLimits();limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE; no breakaway flags.
            Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(ExtendedLimits))));
            var security=new Security{Size=Marshal.SizeOf(typeof(Security)),Inherit=1};
            Check(CreatePipe(out inputRead,out inputWrite,ref security,0));Check(SetHandleInformation(inputWrite,1,0));
            Check(CreatePipe(out outputRead,out outputWrite,ref security,0));Check(SetHandleInformation(outputRead,1,0));
            nul=CreateFileW("NUL",0x40000000,3,ref security,3,0,IntPtr.Zero);Check(nul!=new IntPtr(-1));
            IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
            attributes=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(attributes,1,0,ref size));attributesReady=true;
            handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handles,0,inputRead);Marshal.WriteIntPtr(handles,IntPtr.Size,outputWrite);Marshal.WriteIntPtr(handles,IntPtr.Size*2,nul);
            Check(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
            var startup=new StartupEx{Info=new Startup{Size=Marshal.SizeOf(typeof(StartupEx)),Flags=0x100,Input=inputRead,Output=outputWrite,Error=nul},Attributes=attributes};
            var command=new StringBuilder();foreach(string argument in args){if(command.Length>0)command.Append(' ');command.Append(Quote(argument));}
            // EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW | CREATE_SUSPENDED.
            Check(CreateProcessW(args[0],command,IntPtr.Zero,IntPtr.Zero,true,0x08080004,IntPtr.Zero,null,ref startup,out process));
            Check(AssignProcessToJobObject(job,process.Process));assigned=true;
            Check(ResumeThread(process.Thread)!=uint.MaxValue);Close(ref process.Thread);
            Close(ref inputRead);Close(ref outputWrite);Close(ref nul);
            Console.Error.WriteLine("WORKFLOW_JOB_READY");
            var input=new FileStream(new SafeFileHandle(inputWrite,true),FileAccess.Write);inputWrite=IntPtr.Zero;
            var output=new FileStream(new SafeFileHandle(outputRead,true),FileAccess.Read);outputRead=IntPtr.Zero;
            var eof=new ManualResetEvent(false);
            Copy(Console.OpenStandardInput(),input,delegate(){eof.Set();});
            var outputThread=Copy(output,Console.OpenStandardOutput(),null);
            while(!eof.WaitOne(0)) { uint wait=WaitForSingleObject(process.Process,25);if(wait==0)break;if(wait!=258)throw new IOException("Process wait failed"); }
            Check(TerminateJobObject(job,1));
            var deadline=Stopwatch.StartNew();Accounting accounting;
            while(true) {
                Check(QueryInformationJobObject(job,1,out accounting,Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));
                if(accounting.ActiveProcesses==0)break;
                if(deadline.ElapsedMilliseconds>=5000)throw new IOException("Job drain timeout");Thread.Sleep(10);
            }
            if(WaitForSingleObject(process.Process,5000)!=0)throw new IOException("Root exit timeout");
            if(!outputThread.Join(2000))throw new IOException("Output drain timeout");
            Console.Error.WriteLine("WORKFLOW_JOB_DRAINED");return 0;
        } catch(Exception error) {
            // Error type only: never expose native messages, command arguments or environment.
            var native=error as System.ComponentModel.Win32Exception;
            Console.Error.WriteLine("WORKFLOW_JOB_FAILED:"+error.GetType().Name+(native==null?"":":"+native.NativeErrorCode));return 1;
        } finally {
            // Assignment failure must kill the still-suspended process via its retained handle.
            if(process.Process!=IntPtr.Zero&&!assigned){TerminateProcess(process.Process,1);WaitForSingleObject(process.Process,5000);}
            Close(ref job);Close(ref process.Process);Close(ref process.Thread);
            Close(ref inputRead);Close(ref inputWrite);Close(ref outputRead);Close(ref outputWrite);Close(ref nul);
            if(attributesReady)DeleteProcThreadAttributeList(attributes);
            if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);
        }
    }
}

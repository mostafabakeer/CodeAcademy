export default function DoctorCode({ size = 'md', className = '' }: { size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const scale = { xs: 'scale-[0.44] w-[97px] h-[106px]', sm: 'scale-[0.7] w-[150px] h-[165px]', md: 'scale-100 w-[220px] h-[240px]', lg: 'scale-[1.35] w-[300px] h-[330px]' }[size];

  return (
    <div className={`dc3d ${scale} ${className}`} aria-hidden="true">
      <div className="dc3d-stage">
        <div className="dc3d-robot">
          <span className="dc3d-antenna" />
          <span className="dc3d-head">
            <span className="dc3d-eye dc3d-eye-l" />
            <span className="dc3d-eye dc3d-eye-r" />
            <span className="dc3d-smile" />
          </span>
          <span className="dc3d-body">
            <span className="dc3d-core"><span className="dc3d-core-text">Dr.code</span></span>
          </span>
          <span className="dc3d-steth" />
          <span className="dc3d-tag">د. كود</span>
        </div>
      </div>
     
    </div>
  );
}